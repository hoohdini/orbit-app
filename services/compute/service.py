"""계산 서비스의 두 작업. 저장소(repo)와 인코더(enc)를 받아 pipeline 을 돌리고 결과를 버전을 붙여 쓴다.

precompute  행사 전날 · 체크인 마감
            새 코드북: 전원 임베딩 → 코드북 학습 · 저장 → 주소 · 라벨 → 테이블토크 배정 초안(좌석 순서 포함)
            reuse_codebook=True: 저장된 코드북을 그대로 쓰고 주소가 없는 사람(현장 등록자)에게 주소만 붙인다.
              테이블토크는 전날 확정이라 다시 배정하지 않는다(개발 지시서 v0.2 결정 3). 현장 등록자 자리는 운영 콘솔 워크인 추가(A-05)가 정한다
coffeechat  테이블토크 뒤(포스터세션 중, v0.2 B-04). 3~4명 그룹 첫 배치 한 번. 그 뒤는 자유 이동(추천 목록). 저장된 벡터 + 명함 교환 간선 + 만족도 답 + 포스터 관심도 → 만남 반영 → 커피챗 배정 초안 → 개인 추천
            포스터 관심도는 부르는 시점까지 들어온 답만 쓴다. 포스터세션 끝 무렵에 부를수록 많이 반영된다

배정마다 사람별 이유(table_members.reason)를 남긴다. 운영진 대시보드가 이걸로 배정을 확인한다(9/27 회의)

운영진(role=staff)도 참가자와 똑같이 주소 · 배정 · 추천에 넣는다(9/26 민찬 결정). 결과는 전부 draft 이고 운영자가 공개해야 참가자에게 보인다.

테이블토크 배정(v0.2 B-02 · B-03)
  participants.fixed_table 이 있는 사람(교수 · 운영진석)은 그 테이블에 고정하고 알고리즘에서 뺀다. 보통 1번
  나머지는 남은 번호(2~9번) 8테이블에 고르게(인원 차 1 이하). 같은 기수는 테이블당 3명까지, 4명째부터 1명당 0.5점 감점(10/5 결정, 명단 기수별 인원 보고 다시)
  테이블마다 좌석 순서를 정해 table_members.seat_no 에 저장한다(이웃 점수 합 최대)
"""
from __future__ import annotations

import threading
from collections import Counter
from datetime import datetime, timezone

import numpy as np

from pipeline import codebook as cbm
from pipeline import evidence as evm
from pipeline import recs as recm
from pipeline import people as peoplem
from pipeline import search as searchm
from pipeline import scoring, seating, signals
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


TABLETALK_TABLES = 8
FIXED_TABLE_NO = 1               # 교수 · 운영진석. 고정할 사람이 없어도 알고리즘은 이 번호를 쓰지 않는다(행사장 1번 테이블)
FIXED_TABLE_MAX = 10             # 넘으면 결과에 fixed_over 로 알린다(넘치는 운영진은 서서 진행, 일반 테이블 좌석은 빼지 않음)
TABLETALK_COHORT_CAP = 3         # 같은 기수 4명째부터 감점(10/5 민찬 결정). 운영진 행사 진행 문서 '같은 기수 2~3명을 함께 배치'에 맞춤.
                                 # 지시서 v0.2 는 '40% 넘으면 큰 감점(5)'. 예전 코드(9/26)는 3명째부터 0.5
TABLETALK_COHORT_PENALTY = 0.5   # 작게: 한 기수가 많으면 지킬 수 없는 규칙이라 만족도보다 앞서지 않게. 명단의 기수별 인원을 보고 다시 정한다
COFFEECHAT_GROUP_MAX = 4         # v0.2 결정 10: 커피챗 첫 배치 그룹 3~4명
COFFEECHAT_COHORT_CAP = 2        # 커피챗은 3~4명 그룹이라 같은 기수 3명째부터 0.5점 감점(예전 규칙 그대로)


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


SAT_TEXT = {"gained": "많이 얻었어요", "different": "조금 얻었어요",          # 0012 부터 3지선다(키는 그대로 문구만 바꿈)
            "unsure": "잘 모르겠다", "mismatch": "잘 맞지 않았어요"}         # unsure 는 예전 답(더 받지 않음)
SAT_MIN_ELAPSED_MS = 1000   # 질문이 뜬 뒤 1초도 안 돼 낸 답은 대충 누른 것으로 보고 반영하지 않는다(10/6 민찬)


def _reasons(P, table, A, random_seat, prev: dict[int, int] | None = None,
             sat: dict[int, str] | None = None, exchanges: np.ndarray | None = None,
             posters: dict[int, int] | None = None, posters_not: dict[int, int] | None = None,
             seat: dict[int, int] | None = None, fixed: set[int] | None = None) -> list[dict]:
    """사람마다 왜 이 테이블인지. 운영진 대시보드용(참가자 화면에는 안 보냄).
    best · avg 는 배정에 쓴 쌍 점수(A). prev = 이전 라운드 테이블 번호, sat = 만족도 답, exchanges = 명함을 교환한 상대 수,
    posters = 반영한 관심 포스터 수, posters_not = 관심 분야 아니라고 한 포스터 수.
    table 은 테이블 번호(1부터). seat = 좌석 번호, fixed = 고정 테이블(교수 · 운영진석)에 앉힌 사람."""
    out = []
    for i, t in enumerate(table):
        mates = [j for j in np.where(table == t)[0] if j != i]
        best = max(mates, key=lambda j: A[i, j]) if mates else None
        r = {"table_no": int(t), "random": bool(random_seat[i]),
             "best_mate": P[best]["id"] if best is not None else None,
             "best_score": round(float(A[i, best]), 3) if best is not None else None,
             "avg_score": round(float(np.mean([A[i, j] for j in mates])), 3) if mates else None}
        parts = []
        if seat is not None and i in seat:
            r["seat_no"] = seat[i]
        if fixed is not None and i in fixed:
            r["fixed"] = True
            parts.append(f"{int(t)}번 고정 테이블(교수 · 운영진석)")
        if prev is not None and i in prev:
            r["from_table"] = prev[i]
            parts.append(f"테이블토크 {prev[i]}번 → {int(t)}번")
        if r.get("fixed"):
            pass
        elif r["random"]:
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


def _write_round(repo, round_: str, P, table, a, A, tags, params, reasons: list[dict], event_id: str,
                 seat: dict[int, int] | None = None, orbit: dict[int, tuple] | None = None,
                 A_no_poster: np.ndarray | None = None) -> int:
    """table = 테이블 번호(1부터). seat 이 있으면 table_members.seat_no 에 넣는다(테이블토크).
    orbit = {테이블 번호: (대표 주소 첫자리, 라벨)} → tables_meta.orbit_* (B-08). A_no_poster → pair_scores.score_no_poster (B-05)."""
    v = repo.new_version(round_, params, event_id)
    ids = [p["id"] for p in P]
    repo.insert("table_members", [{"version": v, "table_no": int(t), "participant_id": ids[i], "reason": reasons[i],
                                   **({"seat_no": seat[i]} if seat is not None else {})}
                                  for i, t in enumerate(table)])
    meta = []
    for t in sorted(set(table.tolist())):
        prompts = recm.talk_prompts(list(np.where(table == t)[0]), tags)
        row = {"version": v, "table_no": int(t), "label": None, "talk_prompts": prompts}   # 화면용 이름표는 달지 않는다
        if orbit is not None:
            row["orbit_prefix"], row["orbit_label"] = orbit.get(int(t), (None, None))
        meta.append(row)
    repo.insert("tables_meta", meta)
    n = len(ids)
    repo.insert("pair_scores", [{"version": v, "a": ids[i], "b": ids[j], "score": float(A[i, j]),
                                 "score_ab": float(a[i, j]), "score_ba": float(a[j, i]),
                                 **({"score_no_poster": float(A_no_poster[i, j])} if A_no_poster is not None else {})}
                                for i in range(n) for j in range(i + 1, n)])
    return v


SAME_GROUP_PENALTY = 1.0         # B-06: 이미 아는 사이(같은 기수 · 같은 소속, 또는 같은 활동팀)는 추천 점수에서 크게 뺀다


def _orbit(table: np.ndarray, first_prefix: list[int | None], labels: dict[int, str], tags) -> dict[int, tuple]:
    return {int(t): evm.group_label(list(np.where(table == t)[0]), first_prefix, labels, tags) for t in set(table.tolist())}


def _write_recs(repo, v: int, P, ids, a, met, tags, intents, prefix, rec_mode, n_exact, n_explore, seed) -> np.ndarray:
    """개인 추천 목록(B-06). 상호 점수(기본 min) − 이미 아는 사이 감점(pipeline/people.py), 이미 만난 사람(met) 제외, 노출 상한 · 탐색 칸.
    전날(테이블토크 버전, 입장 ~ 포스터세션용)과 커피챗(자유 이동용) 두 번 만든다. 화면(H-04)은 여기서 거르기만 한다."""
    scores = scoring.rec_matrix(a, rec_mode).copy()
    same = peoplem.acquainted(P)
    scores[same] -= SAME_GROUP_PENALTY
    lists, exposure = recm.personal(scores, met, n_exact=n_exact, n_explore=n_explore, seed=seed, avoid=same)
    repo.insert("recs", [{"version": v, "participant_id": ids[i], "rank": k + 1, "target_id": ids[j], "kind": kind,
                          "reason": recm.reasons(i, j, tags, intents, None, prefix)}
                         for i, lst in enumerate(lists) for k, (j, kind) in enumerate(lst)])
    return exposure


def precompute(repo, enc, event_id: str = "dev", codebook_version: str | None = None,
               reuse_codebook: bool = False, table_mode: str = "min", random_ratio: float = 0.0,
               K: int = 8, L: int = 3, iters: int = 20000, seed: int = 42, n_tables: int = TABLETALK_TABLES,
               rec_mode: str | None = None, n_exact: int = 10, n_explore: int = 2) -> dict:
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
    if reuse_codebook:                                   # 테이블토크는 전날 확정. 주소만 붙이고 끝
        _heartbeat(repo, "precompute")
        return {"version": None, "codebook_version": cb.version, "new_codebook": False, "issued": len(targets),
                "n": len(P), "tables": None}

    is_host = np.array([bool(p.get("is_host")) for p in P])
    cohort = np.array([p["cohort"] if p.get("cohort") is not None else -1 for p in P])
    fixed_no = np.array([int(p["fixed_table"]) if p.get("fixed_table") is not None else 0 for p in P])
    a = scoring.directional(S, O)
    A = scoring.table_matrix(a, is_host, table_mode)

    bad = sorted({int(x) for x in fixed_no if x not in (0, FIXED_TABLE_NO)})
    if bad:                                              # 2~9번 고정은 테이블 크기 균등과 맞물려 아직 지원하지 않는다
        raise ValueError(f"고정 테이블은 {FIXED_TABLE_NO}번만 쓸 수 있다. 명단의 고정테이블 값 {bad} 을 고친다")
    reg = np.where(fixed_no == 0)[0]                     # 알고리즘이 앉힐 사람
    if len(reg) < 5:
        raise ValueError(f"고정 테이블을 뺀 배정 인원이 {len(reg)}명뿐이다 (5명 이상 필요)")
    sizes = seating.even_sizes(len(reg), n_tables)
    taken = set(fixed_no.tolist()) | {FIXED_TABLE_NO}
    free = [t for t in range(1, 100) if t not in taken][:len(sizes)]   # 고정 번호를 건너뛴 번호. 보통 2~9
    r = seating.assign(A[np.ix_(reg, reg)], is_host[reg], cohort[reg], random_ratio=random_ratio, iters=iters,
                       seed=seed, sizes=sizes, cohort_penalty=TABLETALK_COHORT_PENALTY, cohort_cap=TABLETALK_COHORT_CAP)
    table = fixed_no.copy()
    table[reg] = np.array(free)[r.table]
    random_seat = np.zeros(len(P), bool)
    random_seat[reg] = r.random_seat

    seat, seat_sum = {}, {}
    for t in sorted(set(table.tolist())):
        order, total = seating.seat_order(A, list(np.where(table == t)[0]))
        seat.update({int(i): k + 1 for k, i in enumerate(order)})
        seat_sum[str(int(t))] = round(total, 3)          # JSON 키는 문자열로(DB 에서 돌아올 때와 같게)
    cohort_over = seating.cohort_overflow(table[reg], cohort[reg], cap=TABLETALK_COHORT_CAP)
    fixed = {int(i) for i in np.where(fixed_no > 0)[0]}
    params = {"kind": "precompute", "table_mode": table_mode, "random_ratio": random_ratio, "iters": r.iters,
              "codebook_version": cb.version, "reuse_codebook": False, "n": len(P), "n_tables": n_tables,
              "sizes": {str(int(t)): int((table == t).sum()) for t in sorted(set(table.tolist()))}, "fixed": len(fixed),
              "sizes_out_of_range": any(not 8 <= s <= 10 for s in sizes),   # v0.2 테이블당 8~10명 밖이면 운영진이 확인
              "fixed_over": len(fixed) > FIXED_TABLE_MAX,                    # v0.2 미결정 1: 1번 테이블 10명 이하 권장
              "cohort_over": cohort_over, "seat_neighbor_sum": seat_sum, "collision_offer": cbm.collision_rate(co)}
    first_prefix = [int(c[0]) for c in co]
    labels = {k[0]: lab for k, lab in repo.labels(cb.version).items() if len(k) == 1}
    v = _write_round(repo, "tabletalk", P, table, a, A, tags, params,
                     _reasons(P, table, A, random_seat, seat=seat, fixed=fixed), event_id, seat=seat,
                     orbit=_orbit(table, first_prefix, labels, tags))
    # 전날 추천 목록(입장부터 포스터세션까지 명함 탭에 뜸). 같은 테이블토크 테이블 사람은 곧 만나므로 뺀다
    met = seating.same_table_pairs(table)
    np.fill_diagonal(met, True)
    intents = [(prof.get(i) or {}).get("intent_tags") or [] for i in ids]
    exposure = _write_recs(repo, v, P, ids, a, met, tags, intents, [(c,) for c in first_prefix], rec_mode,
                           n_exact, n_explore, seed)
    _heartbeat(repo, "precompute")
    return {"version": v, "codebook_version": cb.version, "new_codebook": new_cb, "issued": len(targets),
            "n": len(P), "tables": len(set(table.tolist())), "fixed": len(fixed), "cohort_over": cohort_over,
            "exposure_min": int(exposure.min()), "exposure_max": int(exposure.max()),
            "sizes_out_of_range": params["sizes_out_of_range"], "fixed_over": params["fixed_over"]}


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
    W, card_stat, card_at = signals.card_matrix(repo.card_exchanges(), idx)   # 확인된 교환 모두 1.0 · 확인 대기 제외(10/5)

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

    # 만족도(0012): 3지선다 + 고른 사람(picks). 고른 사람이 있으면 테이블 전체 평균 대신 그 사람들의 하는 일 쪽으로 옮긴다.
    #   고른 사람이 있으면 테이블 답이 '잘 맞지 않았어요'여도 고른 사람 쪽으로는 약하게(조금 얻었어요 무게) 당긴다.
    #   안 고른 사람은 감점하지 않는다. 1초도 안 돼 낸 답은 응답률에는 세고 반영에서는 뺀다
    sat_rows = [r for r in repo.satisfaction_rows("tabletalk", ids) if r["participant_id"] in idx]
    rate = len(sat_rows) / n
    fallback = rate < min_response_rate
    sw = scoring.sat_weights()
    sat: dict[int, str] = {}
    picked: dict[int, list[int]] = {}
    sat_fast = 0
    for r in sat_rows:
        i = idx[r["participant_id"]]
        if r.get("elapsed_ms") is not None and r["elapsed_ms"] < SAT_MIN_ELAPSED_MS:
            sat_fast += 1
            continue
        sat[i] = r["choice"]
        ps = [idx[p] for p in dict.fromkeys(r.get("picks") or []) if p in idx and idx[p] in mates[i]]
        if ps:
            picked[i] = ps
    targets = [picked.get(i, mates[i]) for i in range(n)]
    sat_w = np.array([max(sw.get(sat.get(i), 0.0), sw.get("different", 0.33)) if i in picked else sw.get(sat.get(i), 0.0)
                      for i in range(n)])
    if fallback:                                                         # 대체 경로 = 만남 반영 없이 텍스트만
        O2, S2 = O, S
    else:
        O2 = O
        S2 = scoring.seek_shift(S, O, targets, sat_w, beta)           # 만족도 · 고른 사람 → Seek
        S2 = scoring.card_shift(S2, O, W, beta, by_weight=True)          # 명함 교환 → Seek

    a_np = scoring.directional(S2, O2)                                   # 포스터 반영 전 점수(B-05 검증용으로 같이 저장)

    # 포스터 → Seek 를 관심 있게 본 포스터 주제 쪽으로 당긴다. 만족도 응답률과 상관없이 답한 사람마다 반영한다
    #   새 응답(poster_responses, 0011 흥미 3단계)이 있으면 B-05 전처리 뒤 폭 0.2 로 당기고, 관심 분야 아님은 밀어낸다
    #   없으면 예전 관심도(poster_interest 3지선다)를 예전 규칙(폭 beta, 관심 없음은 밀어냄)으로 쓴다
    # 사람마다 갈린다 — 새 응답이 있는 사람은 새 규칙, 없고 예전 관심도만 있는 사람은 예전 규칙(예전 데모 화면으로 답한 사람)
    all_posters = {p["id"]: p for p in repo.posters()}
    responses = repo.poster_responses(ids)
    aff = {p["id"]: peoplem.norm_affiliation(p.get("affiliation")) or None for p in repo.participants(event_id)}  # 체크인 안 한 발표자도
    new_rows, poster_stat = signals.poster_signal(responses, idx, all_posters, aff)
    responders = {r["participant_id"] for r in responses}
    lw = scoring.poster_weights()
    old_rows = [(idx[r["participant_id"]], r["poster_id"], lw.get(r["choice"], 0.0))
                for r in repo.poster_interest(ids) if r["participant_id"] in idx and r["participant_id"] not in responders]
    rows = new_rows + old_rows
    pw = {"poster_responses": signals.REASON_WEIGHTS, "poster_interest": lw}
    poster_source = {"poster_responses": len({i for i, _, _ in new_rows}), "poster_interest": len({i for i, _, _ in old_rows})}
    used_ids = {pid for _, pid, wt in rows if wt != 0}
    used = [all_posters[x] for x in sorted(used_ids) if x in all_posters]
    poster_n = dict(Counter(i for i, _, wt in rows if wt > 0))
    poster_not = dict(Counter(i for i, _, wt in rows if wt < 0))
    poster_beta = {"poster_responses": signals.POSTER_BETA, "poster_interest": beta}
    if used:                                                             # 포스터 벡터 = 제목 + 키워드 + 요약(P-03)
        PV, _ = enc.people([[p["title"]] + (["관심 주제: " + ", ".join(p["tags"])] if p.get("tags") else [])
                            + ([p["summary"]] if p.get("summary") else []) for p in used])
        V = {p["id"]: PV[k] for k, p in enumerate(used)}
        for part, b in ((new_rows, signals.POSTER_BETA), (old_rows, beta)):   # 새 응답은 폭 0.2, 예전은 폭 beta. 둘 다 음수 답은 밀어냄
            for negative in (False, True):
                T, pwv = scoring.poster_targets(n, part, V, S2.shape[1], negative=negative)
                S2 = scoring.seek_toward(S2, T, pwv, b)

    # 사람 찾기 검색어 → Seek (10/5 시제품, pipeline/search.py). 기록이 없으면 그대로
    q_items, query_stat = searchm.query_targets(repo.search_logs(ids), idx, card_at,
                                                datetime.now(timezone.utc).timestamp())
    if q_items and hasattr(enc, "encode"):
        S2 = searchm.apply_queries(S2, q_items, O, enc.encode, S_ref=S)   # 상한은 행사 전 저장된 Seek 기준
    else:
        query_stat["used"] = 0
    a = scoring.directional(S2, O2)

    is_host = np.array([bool(p.get("is_host")) for p in P])
    cohort = np.array([p["cohort"] if p.get("cohort") is not None else -1 for p in P])
    A = scoring.table_matrix(a, is_host, table_mode)
    A_np = scoring.table_matrix(a_np, is_host, table_mode)
    sizes = seating.group_sizes(n, COFFEECHAT_GROUP_MAX)
    r = seating.assign(A, is_host, cohort, forbid=forbid, random_ratio=random_ratio, iters=iters, seed=seed,
                       sizes=sizes, cohort_cap=COFFEECHAT_COHORT_CAP)
    params = {"kind": "coffeechat", "table_mode": table_mode, "rec_mode": rec_mode or "env", "beta": beta,
              "response_rate": round(rate, 3), "fallback": fallback, "edges": int((W > 0).sum() // 2), "cards": card_stat,
              "sat_weights": sw, "sat_counts": dict(Counter(sat.values())), "sat_fast": sat_fast,
              "sat_picks": {"people": len(picked), "picked": sum(len(v) for v in picked.values())},
              "poster_source": poster_source, "poster_weights": pw, "poster_beta": poster_beta, "poster_filter": poster_stat,
              "poster_answers": len(rows), "poster_people": len(set(poster_n) | set(poster_not)), "search": query_stat,
              "forbid_hits": r.forbid_hits, "cohort_over": r.cohort_over, "n": n, "groups": len(sizes),
              "group_sizes": dict(Counter(sizes))}
    reasons = _reasons(P, r.table + 1, A, r.random_seat, prev=prev, sat=None if fallback else sat,
                       exchanges=None if fallback else (W > 0).sum(1), posters=poster_n,
                       posters_not=poster_not)
    first_prefix = [int(sid[pid]["offer_sid"][0]) for pid in ids]
    cbv = sid[ids[0]]["codebook_version"]
    labels = {k[0]: lab for k, lab in repo.labels(cbv).items() if len(k) == 1}     # 운영진이 고친 최신 이름표
    v = _write_round(repo, "coffeechat", P, r.table + 1, a, A, tags, params, reasons, event_id,
                     orbit=_orbit(r.table + 1, first_prefix, labels, tags), A_no_poster=A_np)

    # 그룹 구성원 카드 근거 한 줄(B-07). 문장별 벡터가 필요해 인코더의 encode 를 쓴다(없으면 건너뜀)
    n_reasons = 0
    if hasattr(enc, "encode"):
        offers = [(prof.get(pid) or {}).get("offer_text") or "" for pid in ids]
        seeks = [(prof.get(pid) or {}).get("seek_text") or "" for pid in ids]
        oi, ov = evm.item_vectors(enc.encode, offers)
        si_, sv = evm.item_vectors(enc.encode, seeks)
        sim, si, oj = evm.best_match(sv, ov)
        thr = evm.threshold(sim)
        names = [p.get("display_name") or "" for p in P]
        pairs = [(i, j) for g in range(len(sizes)) for i in np.where(r.table == g)[0] for j in np.where(r.table == g)[0]
                 if i != j]
        ev = evm.sentences([(int(i), int(j)) for i, j in pairs], names, si_, oi, sim, si, oj, thr, tags)
        repo.insert("group_reasons", [{"version": v, "participant_id": ids[i], "target_id": ids[j], "kind": k, "text": t}
                                      for (i, j), (k, t) in ev.items()])
        n_reasons = len(ev)

    # 자유 이동용 추천 목록(B-06). 테이블토크 · 커피챗 동석자와 명함을 교환한 사람은 뺀다
    met = forbid | seating.same_table_pairs(r.table) | (W > 0)
    np.fill_diagonal(met, True)
    exposure = _write_recs(repo, v, P, ids, a, met, tags, intents, [(c,) for c in first_prefix], rec_mode,
                           n_exact, n_explore, seed)
    _heartbeat(repo, "coffeechat")
    return {"version": v, "n": n, "tables": len(sizes), "groups": len(sizes), "fallback": fallback,
            "response_rate": round(rate, 3), "forbid_hits": r.forbid_hits, "group_reasons": n_reasons,
            "exposure_min": int(exposure.min()), "exposure_max": int(exposure.max())}


_SEARCH_CACHE: dict[tuple[int, int, str], tuple[float, list[str], np.ndarray, np.ndarray]] = {}
_ITEM_VECS: dict[tuple[int, str], tuple[tuple, np.ndarray]] = {}   # (인코더, 사람) → ((하는 일, 태그), 항목 벡터)
SEARCH_CACHE_SECONDS = 60
_SEARCH_LOCK = threading.Lock()     # 켠 직후 동시에 들어온 검색이 저마다 모든 사람을 다시 만들지 않게


def _item_matrix(repo, enc, event_id: str) -> tuple[list[str], np.ndarray, np.ndarray]:
    """체크인한 사람들의 뜻 검색 항목 벡터(searchm.search_items)와 항목 → 사람 번호.
    웹이 0.5초만 기다리므로 사람 목록 · 프로필은 행사마다 60초 동안 메모리에 둔다(현장 등록자는 60초 안에 들어옴).
    항목 벡터는 하는 일 · 태그가 바뀐 사람만 다시 만든다. 그래도 계산 서비스를 켠 뒤 첫 검색은 모두 만드느라 0.5초를 넘길 수 있다
    (맥 기준 280문장 0.31초, 10/5 잼)"""
    key = (id(repo), id(enc), event_id)
    with _SEARCH_LOCK:
        hit = _SEARCH_CACHE.get(key)
        now = datetime.now(timezone.utc).timestamp()
        if hit and now - hit[0] < SEARCH_CACHE_SECONDS:
            return hit[1], hit[2], hit[3]
        return _refresh_items(repo, enc, event_id, key, now)


def _refresh_items(repo, enc, event_id: str, key: tuple, now: float) -> tuple[list[str], np.ndarray, np.ndarray]:
    ids = [p["id"] for p in _people(repo, event_id, only_checked_in=True)]
    prof = repo.profiles(ids)
    todo: dict[str, tuple] = {}
    for pid in ids:
        pr = prof.get(pid) or {}
        sig = (pr.get("offer_text") or "", tuple(pr.get("topic_tags") or []))
        old = _ITEM_VECS.get((id(enc), pid))
        if old is None or old[0] != sig:
            todo[pid] = sig
    if todo:
        lists = {pid: searchm.search_items(sig[0], list(sig[1])) for pid, sig in todo.items()}
        flat = [s for items in lists.values() for s in items]
        V = unit(np.asarray(enc.encode(flat), dtype=float)) if flat else np.zeros((0, 1))
        k = 0
        for pid, items in lists.items():
            _ITEM_VECS[(id(enc), pid)] = (todo[pid], V[k:k + len(items)])
            k += len(items)
    have = [pid for pid in ids if len(_ITEM_VECS[(id(enc), pid)][1])]
    blocks = [_ITEM_VECS[(id(enc), pid)][1] for pid in have]
    V = np.vstack(blocks) if blocks else np.zeros((0, 1))
    owner = np.repeat(np.arange(len(have)), [len(b) for b in blocks]) if blocks else np.zeros(0, dtype=int)
    _SEARCH_CACHE[key] = (now, have, V, owner)
    return have, V, owner


def search(repo, enc, q: str, event_id: str = "dev", viewer_id: str | None = None,
           aliases: list[str] | None = None, pool: list[str] | None = None) -> dict:
    """뜻 검색(시제품). 체크인한 사람 중 검색어와 '하는 일' · 관심 태그 뜻이 가까운 사람(people)과, 모든 사람의 점수(all_scores).
    점수 = 그 사람 항목(문장 · 태그) 중 가장 높은 cos. aliases = 웹 줄임말 사전이 찾은 같은 뜻 다른 표기(검색어에 붙여 벡터로 바꿈).
    pool = 웹에서 검색할 수 있는 사람(체크인 · 동의). 주면 그 안에서만 기준 · 상위 10명을 잡는다(동의 안 한 사람이 자리를 차지하지 않게)
    웹은 글자로 맞은 사람이 있으면 all_scores 로 더 엄하게 거른다. 점수는 순서 · 거르기용으로만 쓰고 화면에는 내보내지 않는다."""
    q = (q or "").strip()
    if len(q) < 2:
        raise ValueError("검색어는 2자 이상")
    have, V, owner = _item_matrix(repo, enc, event_id)
    if pool is not None:
        keep = set(pool)
        sel = [k for k, pid in enumerate(have) if pid in keep]
        rows = np.isin(owner, sel)
        remap = {k: n for n, k in enumerate(sel)}
        have, V, owner = [have[k] for k in sel], V[rows], np.array([remap[k] for k in owner[rows]], dtype=int)
    if not have:
        return {"q": q, "people": [], "all_scores": {}}
    qv = unit(np.asarray(enc.encode([searchm.query_text(q, aliases)]), dtype=float))[0]
    allsc = searchm.person_max(V @ qv, owner, len(have))
    ranked = searchm.rank_scores(allsc, have, {viewer_id} if viewer_id else set())
    return {"q": q, "people": [{"id": pid, "score": round(sc, 4)} for pid, sc in ranked],
            "all_scores": {pid: round(float(allsc[k]), 4) for k, pid in enumerate(have) if pid != viewer_id}}
