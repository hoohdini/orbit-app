"""계산 서비스의 두 작업. 저장소(repo)와 인코더(enc)를 받아 pipeline 을 돌리고 결과를 버전을 붙여 쓴다.

precompute  행사 전날 · 체크인 마감
            새 코드북: 전원 임베딩 → 코드북 학습 · 저장 → 주소 · 라벨 → 테이블토크 배정 초안
            reuse_codebook=True: 저장된 코드북을 그대로 쓰고 주소가 없는 사람(현장 등록자)만 붙인 뒤 배정을 다시 낸다
coffeechat  테이블토크 뒤. 저장된 벡터 + 명함 교환 간선 → 만남 반영 → 커피챗 배정 초안 → 개인 추천

운영진(role=staff)은 주소 · 배정 · 추천에서 뺀다. 결과는 전부 draft 이고 운영자가 공개해야 참가자에게 보인다.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

import numpy as np

from pipeline import codebook as cbm
from pipeline import recs as recm
from pipeline import scoring, seating
from pipeline.embed import offer_items, seek_items, unit


def _active_key(event_id: str) -> str:
    return f"codebook_active:{event_id}"        # 행사마다 따로. 개발 DB 에 행사가 여러 개 섞여도 서로 덮어쓰지 않게


def _cb_key(version: str) -> str:
    return f"codebook:{version}"


def _save_codebook(repo, cb: cbm.Codebook, event_id: str) -> None:
    """코드북을 ops_state 에 저장한다(새 표 없이). 8 x 3 층 x 384 차원이라 약 100KB."""
    r = lambda a: np.round(a, 6).tolist()
    repo.ops_set(_cb_key(cb.version), {"mu_offer": r(cb.mu_offer), "mu_seek": r(cb.mu_seek),
                                       "centers": [r(c) for c in cb.centers]})
    repo.ops_set(_active_key(event_id), cb.version)


def _load_codebook(repo, event_id: str) -> cbm.Codebook | None:
    ver = repo.ops_get(_active_key(event_id))
    if not ver:
        return None
    d = repo.ops_get(_cb_key(ver))
    if not d:
        return None
    return cbm.Codebook(np.array(d["mu_offer"]), np.array(d["mu_seek"]), [np.array(c) for c in d["centers"]], ver)


def _heartbeat(repo, what: str) -> None:
    repo.ops_set("compute_heartbeat", {"at": datetime.now(timezone.utc).isoformat(), "last": what})


def _people(repo, event_id: str, only_checked_in: bool) -> list[dict]:
    P = [p for p in repo.participants(event_id) if p.get("role") != "staff"]
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
    """주소 앞 1자리 · 2자리마다 사람이 읽는 이름. 그 칸 사람들의 주제 태그 중 가장 흔한 것."""
    rows = []
    for depth in (1, 2):
        groups: dict[tuple, list[int]] = {}
        for i, c in enumerate(map(tuple, codes[:, :depth])):
            groups.setdefault(c, []).append(i)
        for prefix, members in groups.items():
            if depth == 2 and len(members) < 2:
                continue
            cnt = Counter(t for m in members for t in set(tags[m]))
            label = cnt.most_common(1)[0][0] if cnt else f"궤도 {'-'.join(map(str, prefix))}"
            rows.append({"codebook_version": version, "prefix": [int(x) for x in prefix], "label": label})
    return rows


def _write_round(repo, round_: str, P, table, a, A, tags, params) -> int:
    v = repo.new_version(round_, params)
    ids = [p["id"] for p in P]
    repo.insert("table_members", [{"version": v, "table_no": int(t) + 1, "participant_id": ids[i]}
                                  for i, t in enumerate(table)])
    meta = []
    for t in sorted(set(table.tolist())):
        label, prompts = recm.table_meta(list(np.where(table == t)[0]), tags)
        meta.append({"version": v, "table_no": int(t) + 1, "label": label, "talk_prompts": prompts})
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
        raise ValueError("저장된 코드북이 없다. 먼저 reuse_codebook=false 로 한 번 돌린다")
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
    v = _write_round(repo, "tabletalk", P, r.table, a, A, tags, params)
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
        raise ValueError(f"주소가 없는 사람 {len(missing)}명. 체크인 마감 때 precompute(reuse_codebook=true) 를 먼저 돌린다")
    O = unit(np.array([sid[pid]["offer_vec"] for pid in ids], dtype=float))
    S = unit(np.array([sid[pid]["seek_vec"] for pid in ids], dtype=float))

    n = len(ids)
    W = np.zeros((n, n))
    for e in repo.edges():
        if e["a"] in idx and e["b"] in idx:
            i, j = idx[e["a"]], idx[e["b"]]
            W[i, j] = W[j, i] = W[i, j] + float(e.get("weight", 0.3))

    rate = repo.satisfaction_count("tabletalk", ids) / n
    fallback = rate < min_response_rate
    O2 = O if fallback else scoring.inject(O, W, beta)                 # 대체 경로 = 만남 반영 없이 텍스트만
    a = scoring.directional(S, O2)

    forbid = np.zeros((n, n), bool)
    groups: dict[int, list[int]] = {}
    for m in repo.latest_tables("tabletalk", ids):
        if m["participant_id"] in idx:
            groups.setdefault(m["table_no"], []).append(idx[m["participant_id"]])
    for g in groups.values():
        forbid[np.ix_(g, g)] = True
    np.fill_diagonal(forbid, False)

    is_host = np.array([bool(p.get("is_host")) for p in P])
    cohort = np.array([p["cohort"] if p.get("cohort") is not None else -1 for p in P])
    A = scoring.table_matrix(a, is_host, table_mode)
    r = seating.assign(A, is_host, cohort, forbid=forbid, random_ratio=random_ratio, iters=iters, seed=seed)
    rec_scores = scoring.rec_matrix(a, rec_mode)
    params = {"kind": "coffeechat", "table_mode": table_mode, "rec_mode": rec_mode or "env", "beta": beta,
              "response_rate": round(rate, 3), "fallback": fallback, "edges": int((W > 0).sum() // 2),
              "forbid_hits": r.forbid_hits, "cohort_over": r.cohort_over, "n": n}
    v = _write_round(repo, "coffeechat", P, r.table, a, A, tags, params)

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
