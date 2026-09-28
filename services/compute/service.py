"""계산 서비스의 두 작업. 저장소(repo)와 인코더(enc)를 받아 pipeline 을 돌리고 결과를 버전을 붙여 쓴다.

precompute  행사 전날 · 체크인 마감
            새 코드북: 전원 임베딩 → 코드북 학습 · 저장 → 주소 · 라벨 → 테이블토크 배정 초안
            reuse_codebook=True: 저장된 코드북을 그대로 쓰고 주소가 없는 사람(현장 등록자)만 붙인 뒤 배정을 다시 낸다
coffeechat  테이블토크 뒤(포스터세션 중). 저장된 벡터 + 명함 교환 간선 + 만족도 답 + 포스터 관심도 → 만남 반영 → 커피챗 배정 초안 → 개인 추천
            포스터 관심도는 부르는 시점까지 들어온 답만 쓴다. 포스터세션 끝 무렵에 부를수록 많이 반영된다

배정마다 사람별 이유(table_members.reason)를 남긴다. 운영진 대시보드가 이걸로 배정을 확인한다(9/27 회의)

운영진(role=staff)도 참가자와 똑같이 주소 · 배정 · 추천에 넣는다(9/26 민찬 결정). 결과는 전부 draft 이고 운영자가 공개해야 참가자에게 보인다.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

import numpy as np

from pipeline import codebook as cbm
from pipeline import recs as recm
from pipeline import scoring, seating
from pipeline.embed import offer_items, seek_items, unit


def _save_codebook(repo, cb: cbm.Codebook, event_id: str) -> None:
    """코드북을 codebooks 표에 저장하고 이 행사의 활성 코드북으로 둔다(0007). 8 x 3 층 x 384 차원이라 약 100KB."""
    r = lambda a: np.round(a, 6).tolist()
    repo.save_codebook({"version": cb.version, "event_id": event_id, "mu_offer": r(cb.mu_offer), "mu_seek": r(cb.mu_seek),
                        "centers": [r(c) for c in cb.centers]})


def _load_codebook(repo, event_id: str) -> cbm.Codebook | None:
    d = repo.active_codebook(event_id)
    if not d:
        return None
    return cbm.Codebook(np.array(d["mu_offer"]), np.array(d["mu_seek"]), [np.array(c) for c in d["centers"]], d["version"])


def _heartbeat(repo, what: str) -> None:
    repo.ops_set("compute_heartbeat", {"at": datetime.now(timezone.utc).isoformat(), "last": what})


def _people(repo, event_id: str, only_checked_in: bool) -> list[dict]:
    P = repo.participants(event_id)
    if only_checked_in:
        ci = repo.checkins([p["id"] for p in P])
        if ci:
            P = [p for p in P if p["id"] in ci]
    return P


def _embed(enc, P: list[dict], prof: dict[str, dict]):
    get = lambda p, k, d: (prof.get(p["id"]) or {}).get(k) or d
    O, _ = enc.people([offer_items(get(p, "offer_text", ""), get(p, "topic_tags", [])) for p in P])
    S, blank = enc.people([seek_items(get(p, "seek_text", ""), get(p, "intent_tags", [])) for p in P])
    return O, scoring.fill_blank_seek(S, O, blank), blank


def _labels(codes: np.ndarray, tags: list[list[str]], version: str) -> list[dict]:
    """주소 첫자리 묶음(최대 K개)마다 붙이는 이름표 초안. 그 묶음에서 흔한 주제 태그 두 개로 'A, B 계열'. 태그 안에 가운뎃점이 있어(금융·핀테크) 쉼표로 잇는다.
    태그 하나를 그대로 쓰면 수십 명 묶음에 너무 좁은 이름(예: LLM)이 붙어서 두 개로 넓힌다.
    초안일 뿐이고 운영진이 행사 전에 고친다. 둘째 자리 이하는 이름표를 달지 않는다."""
    rows = []
    for c in sorted(set(codes[:, 0].tolist())):
        members = np.where(codes[:, 0] == c)[0]
        cnt = Counter(t for m in members for t in set(tags[m]))
        top = [t for t, _ in cnt.most_common(2)]
        label = ", ".join(top) + " 계열" if top else f"궤도 {c}"
        rows.append({"codebook_version": version, "prefix": [int(c)], "label": label})
    return rows


SAT_TEXT = {"gained": "새로 얻은 게 있었다", "different": "좋았지만 내 관심사와는 조금 달랐다",
            "unsure": "잘 모르겠다", "mismatch": "나와는 잘 안 맞았다"}


def _reasons(P, table, A, random_seat, prev: dict[int, int] | None = None,
             sat: dict[int, str] | None = None, exchanges: np.ndarray | None = None,
             posters: dict[int, int] | None = None, posters_not: dict[int, int] | None = None) -> list[dict]:
    """사람마다 왜 이 테이블인지. 운영진 대시보드용(참가자 화면에는 안 보냄).
    best · avg 는 배정에 쓴 쌍 점수(A). prev = 이전 라운드 테이블 번호, sat = 만족도 답, exchanges = 명함을 교환한 상대 수,
    posters = 반영한 관심 포스터 수, posters_not = 관심 분야 아니라고 한 포스터 수."""
    out = []
    for i, t in enumerate(table):
        mates = [j for j in np.where(table == t)[0] if j != i]
        best = max(mates, key=lambda j: A[i, j]) if mates else None
        r = {"table_no": int(t) + 1, "random": bool(random_seat[i]),
             "best_mate": P[best]["id"] if best is not None else None,
             "best_score": round(float(A[i, best]), 3) if best is not None else None,
             "avg_score": round(float(np.mean([A[i, j] for j in mates])), 3) if mates else None}
        parts = []
        if prev is not None and i in prev:
            r["from_table"] = prev[i]
            parts.append(f"테이블토크 {prev[i]}번 → {int(t) + 1}번")
        if r["random"]:
            parts.append("무작위 자리(새로운 만남용)")
        elif best is not None:
            parts.append(f"가장 잘 맞는 사람 {P[best].get('display_name', '')}({r['best_score']:.2f}), 테이블 평균 {r['avg_score']:.2f}")
        if sat is not None and i in sat:
            r["satisfaction"] = sat[i]
            parts.append(f"만족도 '{SAT_TEXT.get(sat[i], sat[i])}' 반영")
        if exchanges is not None and exchanges[i] > 0:
            r["exchanges"] = int(exchanges[i])
            parts.append(f"명함 교환한 사람 {int(exchanges[i])}명 반영")
        if posters is not None and posters.get(i, 0) > 0:
            r["posters"] = posters[i]
            parts.append(f"관심 포스터 {posters[i]}개 반영")
        if posters_not is not None and posters_not.get(i, 0) > 0:
            r["posters_not"] = posters_not[i]
            parts.append(f"관심 없다고 한 포스터 {posters_not[i]}개 반영")
        r["text"] = ". ".join(parts)
        out.append(r)
    return out


def _write_round(repo, round_: str, P, table, a, A, tags, params, reasons: list[dict], event_id: str) -> int:
    v = repo.new_version(round_, params, event_id)
    ids = [p["id"] for p in P]
    repo.insert("table_members", [{"version": v, "table_no": int(t) + 1, "participant_id": ids[i], "reason": reasons[i]}
                                  for i, t in enumerate(table)])
    meta = []
    for t in sorted(set(table.tolist())):
        prompts = recm.talk_prompts(list(np.where(table == t)[0]), tags)
        meta.append({"version": v, "table_no": int(t) + 1, "label": None, "talk_prompts": prompts})  # 테이블 이름표는 달지 않는다
    repo.insert("tables_meta", meta)
    n = len(ids)
    repo.insert("pair_scores", [{"version": v, "a": ids[i], "b": ids[j], "score": float(A[i, j]),
                                 "score_ab": float(a[i, j]), "score_ba": float(a[j, i])}
                                for i in range(n) for j in range(i + 1, n)])
    return v


def precompute(repo, enc, event_id: str = "dev", codebook_version: str | None = None,
               reuse_codebook: bool = False, table_mode: str = "min", random_ratio: float = 0.0,
               K: int = 8, L: int = 3, iters: int = 20000, seed: int = 42) -> dict:
    P = _people(repo, event_id, only_checked_in=reuse_codebook)
    if len(P) < 5:
        raise ValueError(f"배정할 사람이 {len(P)}명뿐이다 (5명 이상 필요)")
    ids = [p["id"] for p in P]
    prof = repo.profiles(ids)
    tags = [(prof.get(i) or {}).get("topic_tags") or [] for i in ids]
    O, S, blank = _embed(enc, P, prof)

    cb = _load_codebook(repo, event_id) if reuse_codebook else None
    if reuse_codebook and cb is None:
        raise ValueError("저장된 코드북이 없다. 전날 계산(reuse_codebook=false)을 먼저 돌린다")
    new_cb = cb is None
    if new_cb:
        # 행사 이름 + 초까지. 같은 분 안에 다른 행사가 돌려도 이름이 겹쳐 서로 덮어쓰지 않게
        ver = codebook_version or f"cb-{event_id}-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")[:-3]
        cb = cbm.fit(O, S[~blank], ver, K=K, L=L, seed=seed)
        _save_codebook(repo, cb, event_id)
    co, cs = cb.address(O, "offer"), cb.address(S, "seek")

    have = repo.sids(ids) if reuse_codebook else {}
    targets = [i for i, pid in enumerate(ids) if not (have.get(pid) and have[pid]["codebook_version"] == cb.version)]
    rl = lambda v: [round(float(x), 6) for x in v]
    repo.upsert_sids([{"participant_id": ids[i], "offer_sid": co[i].tolist(), "seek_sid": cs[i].tolist(),
                       "offer_vec": rl(O[i]), "seek_vec": rl(S[i]), "codebook_version": cb.version,
                       "is_temp": False} for i in targets])
    if new_cb:
        repo.upsert_labels(_labels(co, tags, cb.version))

    is_host = np.array([bool(p.get("is_host")) for p in P])
    cohort = np.array([p["cohort"] if p.get("cohort") is not None else -1 for p in P])
    a = scoring.directional(S, O)
    A = scoring.table_matrix(a, is_host, table_mode)
    r = seating.assign(A, is_host, cohort, random_ratio=random_ratio, iters=iters, seed=seed)
    params = {"kind": "precompute", "table_mode": table_mode, "random_ratio": random_ratio, "iters": r.iters,
              "codebook_version": cb.version, "reuse_codebook": reuse_codebook, "n": len(P),
              "cohort_over": r.cohort_over, "collision_offer": cbm.collision_rate(co)}
    v = _write_round(repo, "tabletalk", P, r.table, a, A, tags, params, _reasons(P, r.table, A, r.random_seat), event_id)
    _heartbeat(repo, "precompute")
    return {"version": v, "codebook_version": cb.version, "new_codebook": new_cb, "issued": len(targets),
            "n": len(P), "tables": int(r.table.max()) + 1, "cohort_over": r.cohort_over}


def coffeechat(repo, enc, event_id: str = "dev", min_response_rate: float = 0.5, table_mode: str = "min",
               rec_mode: str | None = None, random_ratio: float = 0.0, beta: float = 0.5,
               n_exact: int = 10, n_explore: int = 2, iters: int = 20000, seed: int = 43) -> dict:
    P = _people(repo, event_id, only_checked_in=True)
    if len(P) < 5:
        raise ValueError(f"배정할 사람이 {len(P)}명뿐이다 (5명 이상 필요)")
    ids = [p["id"] for p in P]
    idx = {pid: i for i, pid in enumerate(ids)}
    prof = repo.profiles(ids)
    tags = [(prof.get(i) or {}).get("topic_tags") or [] for i in ids]
    intents = [(prof.get(i) or {}).get("intent_tags") or [] for i in ids]

    sid = repo.sids(ids)
    missing = [i for i, pid in enumerate(ids) if pid not in sid]
    if missing:
        raise ValueError(f"주소가 없는 사람 {len(missing)}명. 체크인 마감 계산(precompute reuse_codebook=true)을 먼저 돌린다")
    O = unit(np.array([sid[pid]["offer_vec"] for pid in ids], dtype=float))
    S = unit(np.array([sid[pid]["seek_vec"] for pid in ids], dtype=float))

    n = len(ids)
    W = np.zeros((n, n))
    for e in repo.edges():
        if e["a"] in idx and e["b"] in idx:
            i, j = idx[e["a"]], idx[e["b"]]
            W[i, j] = W[j, i] = W[i, j] + float(e.get("weight", 0.3))

    forbid = np.zeros((n, n), bool)
    groups: dict[int, list[int]] = {}
    prev: dict[int, int] = {}
    for m in repo.latest_tables("tabletalk", ids, event_id):
        if m["participant_id"] in idx:
            groups.setdefault(m["table_no"], []).append(idx[m["participant_id"]])
            prev[idx[m["participant_id"]]] = m["table_no"]
    for g in groups.values():
        forbid[np.ix_(g, g)] = True
    np.fill_diagonal(forbid, False)
    mates = [[j for j in groups.get(prev[i], []) if j != i] if i in prev else [] for i in range(n)]

    sat_raw = repo.satisfaction("tabletalk", ids)
    sat = {idx[pid]: c for pid, c in sat_raw.items() if pid in idx}
    rate = len(sat) / n
    fallback = rate < min_response_rate
    sw = scoring.sat_weights()
    if fallback:                                                         # 대체 경로 = 만남 반영 없이 텍스트만
        O2, S2 = O, S
    else:
        O2 = O
        S2 = scoring.seek_shift(S, O, mates, np.array([sw.get(sat.get(i), 0.0) for i in range(n)]), beta)  # 만족도 → Seek
        S2 = scoring.card_shift(S2, O, W, beta)                          # 명함 교환 → Seek (9/29, 예전엔 Offer)

    # 포스터 관심도 → Seek 를 관심 있게 본 포스터 주제 쪽으로 당기고, 관심 없다고 한 주제에서는 조금 밀어낸다.
    # 만족도 응답률과 상관없이 답한 사람마다 반영한다
    pw = scoring.poster_weights()
    rows = [(idx[r["participant_id"]], r["poster_id"], pw.get(r["choice"], 0.0))
            for r in repo.poster_interest(ids) if r["participant_id"] in idx]
    used_ids = {pid for _, pid, wt in rows if wt != 0}
    used = [p for p in repo.posters() if p["id"] in used_ids]
    poster_n = dict(Counter(i for i, _, wt in rows if wt > 0))
    poster_not = dict(Counter(i for i, _, wt in rows if wt < 0))
    if used:
        PV, _ = enc.people([[p["title"]] + (["관심 주제: " + ", ".join(p["tags"])] if p["tags"] else []) for p in used])
        V = {p["id"]: PV[k] for k, p in enumerate(used)}
        for negative in (False, True):
            T, pwv = scoring.poster_targets(n, rows, V, S2.shape[1], negative=negative)
            S2 = scoring.seek_toward(S2, T, pwv, beta)
    a = scoring.directional(S2, O2)

    is_host = np.array([bool(p.get("is_host")) for p in P])
    cohort = np.array([p["cohort"] if p.get("cohort") is not None else -1 for p in P])
    A = scoring.table_matrix(a, is_host, table_mode)
    r = seating.assign(A, is_host, cohort, forbid=forbid, random_ratio=random_ratio, iters=iters, seed=seed)
    rec_scores = scoring.rec_matrix(a, rec_mode)
    params = {"kind": "coffeechat", "table_mode": table_mode, "rec_mode": rec_mode or "env", "beta": beta,
              "response_rate": round(rate, 3), "fallback": fallback, "edges": int((W > 0).sum() // 2),
              "sat_weights": sw, "sat_counts": dict(Counter(sat.values())),
              "poster_weights": pw, "poster_answers": len(rows), "poster_people": len(set(poster_n) | set(poster_not)),
              "forbid_hits": r.forbid_hits, "cohort_over": r.cohort_over, "n": n}
    reasons = _reasons(P, r.table, A, r.random_seat, prev=prev, sat=None if fallback else sat,
                       exchanges=None if fallback else (W > 0).sum(1), posters=poster_n,
                       posters_not=poster_not)
    v = _write_round(repo, "coffeechat", P, r.table, a, A, tags, params, reasons, event_id)

    met = forbid | seating.same_table_pairs(r.table) | (W > 0)
    np.fill_diagonal(met, True)
    lists, exposure = recm.personal(rec_scores, met, n_exact=n_exact, n_explore=n_explore, seed=seed)
    prefix = [tuple(sid[pid]["offer_sid"][:1]) for pid in ids]
    repo.insert("recs", [{"version": v, "participant_id": ids[i], "rank": k + 1, "target_id": ids[j], "kind": kind,
                          "reason": recm.reasons(i, j, tags, intents, None, prefix)}
                         for i, lst in enumerate(lists) for k, (j, kind) in enumerate(lst)])
    _heartbeat(repo, "coffeechat")
    return {"version": v, "n": n, "tables": int(r.table.max()) + 1, "fallback": fallback,
            "response_rate": round(rate, 3), "forbid_hits": r.forbid_hits,
            "exposure_min": int(exposure.min()), "exposure_max": int(exposure.max())}
