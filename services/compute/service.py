"""계산 서비스의 두 작업. 저장소(repo)와 인코더(enc)를 받아 pipeline 을 돌리고 결과를 버전을 붙여 쓴다.

precompute  행사 전날 · 체크인 마감
            새 코드북: 전원 임베딩 → 코드북 학습 · 저장 → 주소 · 라벨 → 테이블토크 배정 초안(좌석 순서 포함)
            reuse_codebook=True: 저장된 코드북을 그대로 쓰고 주소가 없는 사람(현장 등록자)에게 주소만 붙인다.
              테이블토크는 전날 확정이라 다시 배정하지 않는다(개발 지시서 v0.2 결정 3). 현장 등록자 자리는 운영 콘솔 워크인 추가(A-05)가 정한다
coffeechat  테이블토크 뒤(포스터세션 중, v0.2 B-04). 행사장 10테이블 전부에 체크인한 전원(운영진 · 교수 포함, 1번 고정 없음)을 고르게 한 번(10/22 민찬 결정).
            테이블마다 주도 선배 2명(높은 기수 중 분야가 맞는 둘)을 먼저 앉히고 나머지를 점수로 채운다.
            테이블마다 좌석 순서도 정한다(테이블토크와 같은 이웃 점수 합 최대, table_members.seat_no). 주도 선배 둘은 마주 보게(COFFEE_LEAD_SEATING, 10/23 운영진 확정).
            지연 체크인(checkins.is_late)한 사람은 배정에는 넣되 주도 선배로 뽑지 않는다(구현하며 정함).
            일찍 나간다고 표시한 사람(checkins.left_at, 0019)은 배정에도 주도 선배에도 넣지 않는다(10/25 민찬 결정). 행사 직후 추천(final)은 빼지 않는다.
            커피챗 중에는 이동하지 않는다(10/21 민찬 결정, 이동 불가). 저장된 벡터 + 명함 교환 간선 + 만족도 답 + 포스터 관심도 → 만남 반영 → 커피챗 배정 초안 → 개인 추천
            포스터 관심도는 부르는 시점까지 들어온 답만 쓴다. 포스터세션 끝 무렵에 부를수록 많이 반영된다
coffeechat_late  커피챗 배정 공개 뒤 처음 체크인한 사람 한 명의 자리를 고른다(10/25 민찬 결정, 쓰기는 웹). 행사 전 정보만으로 잘 맞는 테이블

배정마다 사람별 이유(table_members.reason)를 남긴다. 운영진 대시보드가 이걸로 배정을 확인한다(9/27 회의)

운영진(role=staff)도 참가자와 똑같이 주소 · 배정 · 추천에 넣는다(9/26 민찬 결정). 결과는 전부 draft 이고 운영자가 공개해야 참가자에게 보인다.

테이블토크 배정(v0.2 B-02 · B-03)
  participants.fixed_table 이 있는 사람(교수 · 운영진석)은 그 테이블에 고정하고 알고리즘에서 뺀다. 보통 1번
  나머지는 남은 번호(2~10번) 9테이블에 고르게(인원 차 1 이하, 행사장 10테이블 중 1번 제외. 10/21 민찬 결정). 같은 기수는 테이블당 3명까지, 4명째부터 1명당 0.5점 감점(10/5 결정, 명단 기수별 인원 보고 다시)
  테이블마다 좌석 순서를 정해 table_members.seat_no 에 저장한다(이웃 점수 합 최대)
"""
from __future__ import annotations

import dataclasses
import json
import os
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


TABLETALK_TABLES = 9             # 알고리즘 테이블 2~10번. 행사장 10테이블 중 1번은 운영진 7 + 연사 교수 3 = 10명 고정(10/21 민찬 결정)
FIXED_TABLE_NO = 1               # 교수 · 운영진석. 고정할 사람이 없어도 알고리즘은 이 번호를 쓰지 않는다(행사장 1번 테이블)
FIXED_TABLE_MAX = 10             # 넘으면 결과에 fixed_over 로 알린다(넘치는 운영진은 서서 진행, 일반 테이블 좌석은 빼지 않음)
TABLETALK_COHORT_CAP = 3         # 같은 기수 4명째부터 감점(10/5 민찬 결정). 운영진 행사 진행 문서 '같은 기수 2~3명을 함께 배치'에 맞춤.
                                 # 지시서 v0.2 는 '40% 넘으면 큰 감점(5)'. 예전 코드(9/26)는 3명째부터 0.5
TABLETALK_COHORT_PENALTY = 0.5   # 작게: 한 기수가 많으면 지킬 수 없는 규칙이라 만족도보다 앞서지 않게. 명단의 기수별 인원을 보고 다시 정한다
COFFEECHAT_TABLES = 10           # 커피챗은 행사장 10테이블 전부, 1번 고정 없이 체크인한 전원(10/22 민찬 결정. 예전 v0.2 결정 10 의 3~4명 그룹에서 바꿈)
COFFEECHAT_COHORT_CAP = TABLETALK_COHORT_CAP           # 테이블 크기가 테이블토크와 같아(8명 안팎) 같은 규칙: 4명째부터(10/22 민찬 결정, 예전 3~4명 그룹은 3명째부터)
COFFEECHAT_COHORT_PENALTY = TABLETALK_COHORT_PENALTY   # 1명당 0.5
# 커피챗 주도 선배 두 명의 좌석(seating.lead_fixed). facing = 마주 보게(8명이면 좌석 1 · 5번, 10/23 운영진 확정) · adjacent = 옆자리 · free = 따로 정하지 않음.
# 환경변수 COFFEE_LEAD_SEATING 으로 바꿀 수 있다
COFFEE_LEAD_SEATING = "facing"
# 커피챗에 앉지 않는 사람(10/27 민찬 결정: 김강열 연사는 커피챗 불참 — 당일 '나감 표시'를 잊어도 자리가 생기지 않게).
#   ops_state 의 이 키에 participant id 목록을 둔다(DB 구조 변경 없음). 커피챗 계산 · 늦게 온 사람 자리에서 빼고, 행사 직후 추천(final)은 빼지 않는다
COFFEECHAT_SKIP_KEY = "coffeechat_skip"
# 늦참 예정(10/30 민찬 결정: 당일 '지연 체크인' 을 잊어도 되게 미리 넣어 둔다). 체크인 전이어도 커피챗 자리를 잡아 두고(도착할 때까지 빈자리)
#   주도 선배에서 뺀다. 예전 콘솔 '지연 체크인으로 표시'(checkins.is_late)와 같은 효과. 행사 직후 추천(final)에는 쓰지 않는다
COFFEECHAT_LATE_KEY = "coffeechat_late"
# 커피챗에서 서로 다른 테이블에 앉힐 사람 묶음(10/30 성하 결정: BENOW 채용담당자 두 분은 한 명씩 따로).
#   ops_state 의 이 키에 묶음 목록([["<id>", "<id>"], ...])을 둔다. id 하나짜리 목록(["<id>", "<id>"])은 한 묶음으로 읽는다.
#   계산에서 금지 쌍으로 넣고(벌점), 그래도 같은 테이블이면 한 명을 다른 테이블 사람과 맞바꾼다(보장). 행사 직후 추천(final)은 원본 그대로
COFFEECHAT_APART_KEY = "coffeechat_apart"


def _coffee_skip(repo) -> set[str]:
    return _id_list(repo, COFFEECHAT_SKIP_KEY)


def _id_list(repo, key: str) -> set[str]:
    """ops_state 의 id 목록(소문자). 배열 · {ids: [...]} · JSON 문자열 모두 읽는다(웹 lib/opsState.idList 와 같은 규칙, 코드리뷰)."""
    v = repo.ops_get(key)
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            v = [v]
    if isinstance(v, dict):
        v = v.get("ids")
    return {str(x).strip().lower() for x in v if str(x).strip()} if isinstance(v, list) else set()


def _apart_groups(repo) -> list[set[str]]:
    """COFFEECHAT_APART_KEY 의 묶음 목록(소문자 id). 묶음 목록 · id 목록(한 묶음) · {groups: [...]} · JSON 문자열을 읽는다."""
    v = repo.ops_get(COFFEECHAT_APART_KEY)
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return []
    if isinstance(v, dict):
        v = v.get("groups")
    if not isinstance(v, list) or not v:
        return []
    raw = v if all(isinstance(g, list) for g in v) else [v]
    groups = [{str(x).strip().lower() for x in g if str(x).strip()} for g in raw]
    return [g for g in groups if len(g) >= 2]


def _split_apart(table: np.ndarray, apart: np.ndarray, forbid: np.ndarray, A: np.ndarray, cohort: np.ndarray,
                 keep: set[int]) -> tuple[np.ndarray, int]:
    """apart 쌍이 같은 테이블이면 한 명을 다른 테이블 사람과 맞바꾼다(인원은 그대로). 주도 선배(keep)는 옮기지 않는다.
    맞바꿀 사람은 새 apart 쌍을 만들지 않는 사람 중 기수가 같은 사람(기수 상한이 그대로), 금지 쌍이 덜 생기는 사람, 점수가 덜 떨어지는 사람 순.
    고친 table 과 맞바꾼 횟수를 돌려준다. 못 고치면 ValueError(조용히 같은 테이블에 두지 않는다)"""
    t = table.copy()
    swaps = 0
    for _ in range(len(t)):
        bad = [(i, j) for i, j in zip(*np.nonzero(np.triu(apart, 1))) if t[i] == t[j]]
        if not bad:
            return t, swaps
        i, j = bad[0]
        movers = [x for x in (j, i) if x not in keep]
        best = None
        for m in movers:
            home = t[m]
            for k in range(len(t)):
                if t[k] == home or k in keep:
                    continue
                there = [x for x in np.nonzero(t == t[k])[0] if x != k]
                here = [x for x in np.nonzero(t == home)[0] if x != m]
                if apart[m, there].any() or apart[k, here].any():
                    continue
                key = (cohort[k] != cohort[m],
                       int(forbid[m, there].sum() + forbid[k, here].sum()),
                       -float(A[m, there].sum() + A[k, here].sum() - A[m, here].sum() - A[k, there].sum()))
                if best is None or key < best[0]:
                    best = (key, m, k)
        if best is None:
            raise ValueError("커피챗에서 따로 앉힐 사람(coffeechat_apart)을 나눌 자리가 없다")
        _, m, k = best
        t[m], t[k] = t[k], t[m]
        swaps += 1
    raise ValueError("커피챗에서 따로 앉힐 사람(coffeechat_apart)을 나누지 못했다")


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


SAT_TEXT = {"gained": "최고였어요", "different": "좋았어요",                # 10/9 부터 "배정은 어땠나요?" 따봉 3단계(키는 그대로 문구만 바꿈)
            "unsure": "잘 모르겠다", "mismatch": "별로였어요"}               # unsure 는 예전 답(더 받지 않음)
SAT_MIN_ELAPSED_MS = 2000   # 질문이 뜬 뒤 제출까지 2초도 안 걸린 답은 읽지 않고 누른 것으로 보고 반영하지 않는다(10/9 민찬: 1초 → 2초, 제출까지)
SAT_PICK_MIN_WEIGHT = 0.33  # '별로였어요'인데 고른 사람이 있으면 그 사람 쪽으로만 이 무게로 당긴다(민찬 제안 아님, 구현 판단). 환경변수와 무관한 상수
SAT_PICK_SHARE = 0.5        # 고른 사람이 있으면 목표 방향 = 고른 사람 평균 50% + 나머지 동석자 평균 50%(10/9 민찬, 리허설 뒤 다시)


def _reasons(P, table, A, random_seat, prev: dict[int, int] | None = None,
             sat: dict[int, str] | None = None, exchanges: np.ndarray | None = None,
             posters: dict[int, int] | None = None, posters_not: dict[int, int] | None = None,
             seat: dict[int, int] | None = None, fixed: set[int] | None = None, lead: set[int] | None = None) -> list[dict]:
    """사람마다 왜 이 테이블인지. 운영진 대시보드용(참가자 화면에는 안 보냄).
    best · avg 는 배정에 쓴 쌍 점수(A). prev = 이전 라운드 테이블 번호, sat = 만족도 답, exchanges = 명함을 교환한 상대 수,
    posters = 반영한 관심 포스터 수, posters_not = 관심 분야 아니라고 한 포스터 수.
    table 은 테이블 번호(1부터). seat = 좌석 번호, fixed = 고정 테이블(교수 · 운영진석)에 앉힌 사람, lead = 커피챗 주도 선배."""
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
        if lead is not None and i in lead:
            r["lead"] = True
            c = P[i].get("cohort")
            parts.append(f"주도 선배({c}기)" if c is not None else "주도 선배")
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
                 A_no_poster: np.ndarray | None = None, write: np.ndarray | None = None) -> int:
    """table = 테이블 번호(1부터). seat 이 있으면 table_members.seat_no 에 넣는다(테이블토크 · 커피챗, 커피챗은 10/23 부터).
    seat 에 없는 사람(좌석 번호 없던 예전 원본을 이어 쓰는 행사 직후 추천)은 seat_no 를 비운다.
    orbit = {테이블 번호: (대표 주소 첫자리, 라벨)} → tables_meta.orbit_* (B-08). A_no_poster → pair_scores.score_no_poster (B-05).
    write = 자리를 쓸 사람(bool). 없으면 전원. 행사 직후 추천에서 커피챗 배정이 없던 사람은 자리를 쓰지 않는다(없는 조 번호가 화면에 뜨지 않게)"""
    v = repo.new_version(round_, params, event_id)
    ids = [p["id"] for p in P]
    w = np.ones(len(ids), bool) if write is None else write
    repo.insert("table_members", [{"version": v, "table_no": int(t), "participant_id": ids[i], "reason": reasons[i],
                                   **({"seat_no": seat[i]} if seat is not None and i in seat else {})}
                                  for i, t in enumerate(table) if w[i]])
    meta = []
    for t in sorted(set(table[w].tolist())):
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


def _rec_mode(rec_mode: str | None) -> str:
    return rec_mode or os.environ.get("REC_SCORE", "rule")


def _rec_scores(S, O, a, P, intents, rec_mode) -> np.ndarray:
    """개인 추천 점수. 기본 rule(10/18): 찾는 사람 → 하는 일 · 하는 일끼리 · '줄 수 있는 것' 규칙을 섞은 한 방향(scoring.rec_rule_score).
    예전 방식(min · one_way · avg · harmonic)은 REC_SCORE 나 요청의 rec_mode 로."""
    if _rec_mode(rec_mode) == "rule" and _rule_ready(P, intents):
        return scoring.rec_rule_score(S, O, intents, _careers(P))
    # 규칙 재료가 없으면(0015 전 DB · 예전 명단 · 아무도 규칙 있는 선택지를 안 고름) 평가하지 않은 조합만 남는다 → 예전 min
    return scoring.rec_matrix(a, "min" if _rec_mode(rec_mode) == "rule" else _rec_mode(rec_mode))


def _careers(P) -> list:
    """사람마다 구분. 여러 개(careers, 0017, 폼 경험 문항 · 구분 · 직책으로 명단 적재가 정함)가 있으면 그것, 없으면 하나(career, 0015 · 0016)."""
    return [p.get("careers") or p.get("career") for p in P]


def _rule_ready(P, intents) -> bool:
    return bool(scoring.gives_matrix(intents, _careers(P)).any())


def _rec_params(P, intents, rec_mode) -> dict:
    """계산 기록(assign_versions.params)에 어떤 점수로 추천 목록을 만들었는지 남긴다."""
    known = sum(1 for c in _careers(P) if c)
    mode = _rec_mode(rec_mode)
    return {"rec_mode": mode if (mode != "rule" or _rule_ready(P, intents)) else "min(규칙 재료 없음)", "career_known": known,
            "intent_unknown": scoring.intent_unknown(intents)}


def _write_recs(repo, v: int, P, ids, scores, met, tags, intents, prefix, n_exact, n_explore, seed) -> np.ndarray:
    """개인 추천 목록(B-06). 추천 점수(_rec_scores) − 이미 아는 사이 감점(pipeline/people.py), 이미 만난 사람(met) 제외, 노출 상한 · 탐색 칸.
    전날(테이블토크 버전, 입장 ~ 포스터세션용)과 커피챗 뒤(커피챗 버전) 두 번 만든다. 화면(H-04)은 여기서 거르기만 한다."""
    scores = scores.copy()
    same = peoplem.acquainted(P)
    # 이미 아는 사이는 크게 뺀다. cos 점수(범위 1 미만)에서는 예전처럼 1.0, 표준화 점수(rule)에서는 점수 폭만큼 빼서 같은 효과(사실상 뒤로)
    scores[same] -= SAME_GROUP_PENALTY * max(1.0, float(np.ptp(scores)))
    lists, exposure = recm.personal(scores, met, n_exact=n_exact, n_explore=n_explore, seed=seed, avoid=same)
    repo.insert("recs", [{"version": v, "participant_id": ids[i], "rank": k + 1, "target_id": ids[j], "kind": kind,
                          "reason": recm.reasons(i, j, tags, intents, None, prefix)}
                         for i, lst in enumerate(lists) for k, (j, kind) in enumerate(lst)])
    return exposure


def precompute(repo, enc, event_id: str = "dev", codebook_version: str | None = None,
               reuse_codebook: bool = False, table_mode: str = "min", random_ratio: float = 0.0,
               K: int = 8, L: int = 3, iters: int = 20000, seed: int = 42, n_tables: int = TABLETALK_TABLES,
               rec_mode: str | None = None, n_exact: int = recm.N_EXACT, n_explore: int = recm.N_EXPLORE) -> dict:
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
    A = scoring.table_matrix(scoring.seat_directional(S, O), is_host, table_mode)   # 배정만 보정 점수(10/17 비교 평가)

    bad = sorted({int(x) for x in fixed_no if x not in (0, FIXED_TABLE_NO)})
    if bad:                                              # 2~10번 고정은 테이블 크기 균등과 맞물려 아직 지원하지 않는다
        raise ValueError(f"고정 테이블은 {FIXED_TABLE_NO}번만 쓸 수 있다. 명단의 고정테이블 값 {bad} 을 고친다")
    reg = np.where(fixed_no == 0)[0]                     # 알고리즘이 앉힐 사람
    if len(reg) < 5:
        raise ValueError(f"고정 테이블을 뺀 배정 인원이 {len(reg)}명뿐이다 (5명 이상 필요)")
    sizes = seating.even_sizes(len(reg), n_tables)
    taken = set(fixed_no.tolist()) | {FIXED_TABLE_NO}
    free = [t for t in range(1, 100) if t not in taken][:len(sizes)]   # 고정 번호를 건너뛴 번호. 보통 2~10
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
    intents = [(prof.get(i) or {}).get("intent_tags") or [] for i in ids]
    params = {"kind": "precompute", "table_mode": table_mode, "random_ratio": random_ratio, "iters": r.iters, **_rec_params(P, intents, rec_mode),
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
    exposure = _write_recs(repo, v, P, ids, _rec_scores(S, O, a, P, intents, rec_mode), met, tags, intents,
                           [(c,) for c in first_prefix], n_exact, n_explore, seed)
    _heartbeat(repo, "precompute")
    return {"version": v, "codebook_version": cb.version, "new_codebook": new_cb, "issued": len(targets),
            "n": len(P), "tables": len(set(table.tolist())), "fixed": len(fixed), "cohort_over": cohort_over,
            "exposure_min": int(exposure.min()), "exposure_max": int(exposure.max()),
            "sizes_out_of_range": params["sizes_out_of_range"], "fixed_over": params["fixed_over"]}


def _keep_groups(repo, ids: list[str], idx: dict[str, int], event_id: str, forbid: np.ndarray,
                 cohort: np.ndarray) -> tuple[seating.Seating, list[int], np.ndarray, dict, set[int], dict[int, int]]:
    """행사 직후 추천(final)용. 원본 커피챗 그룹을 그대로 둔다. 테이블 번호 · 무작위 자리 표시도 그대로.
    원본 = 한 번이라도 공개된 커피챗 버전 중 final 이 아닌 최신 것(repo.coffeechat_source). final 을 공개하면 원본이 retired 가 되므로,
    final 을 철회하고 다시 돌려도 같은 그룹을 찾는다. 공개된 적 없는 초안으로는 돌지 않는다.
    커피챗 배정 뒤에 들어온 사람은 계산 안에서만 혼자 한 그룹으로 두고(동석자로 빠지는 사람이 없게) 자리는 쓰지 않는다.
    좌석 번호(seat_no)도 원본 그대로 둔다(10/23, 없으면 reason.seat_no).
    돌려주는 것: (배정, 그룹 크기, 자리를 쓸 사람, 원본 버전, 원본의 주도 선배(reason.lead, 10/22), 좌석 번호)"""
    src, rows = repo.coffeechat_source(ids, event_id)
    if src is None:
        raise ValueError("공개된 커피챗 배정이 없다. 행사 직후 추천은 커피챗 계산 · 공개 뒤에 한다")
    table = np.full(len(ids), -1)
    random_seat = np.zeros(len(ids), bool)
    lead: set[int] = set()
    seat: dict[int, int] = {}
    for m in rows:
        i = idx[m["participant_id"]]
        table[i] = int(m["table_no"]) - 1
        random_seat[i] = bool((m.get("reason") or {}).get("random"))
        if (m.get("reason") or {}).get("lead"):
            lead.add(i)
        no = m.get("seat_no") if m.get("seat_no") is not None else (m.get("reason") or {}).get("seat_no")
        if no is not None:
            seat[i] = int(no)
    seated = table >= 0
    nxt = int(table.max()) + 1
    for i in np.where(~seated)[0]:
        table[i] = nxt
        nxt += 1
    same = seating.same_table_pairs(table)
    r = seating.Seating(table=table, random_seat=random_seat, satisfaction=np.zeros(len(ids)), objective=0.0,
                        forbid_hits=int((forbid & same).sum() // 2),
                        cohort_over=seating.cohort_overflow(table, cohort, cap=COFFEECHAT_COHORT_CAP), iters=0)
    sizes = [int(c) for c in np.bincount(table[seated]) if c > 0]
    return r, sizes, seated, src, lead, seat


def coffeechat(repo, enc, event_id: str = "dev", min_response_rate: float = 0.5, table_mode: str = "min",
               rec_mode: str | None = None, random_ratio: float = 0.0, beta: float = 0.5,
               n_exact: int = recm.N_EXACT, n_explore: int = recm.N_EXPLORE, iters: int = 20000, seed: int = 43, final: bool = False) -> dict:
    """커피챗 계산(16:45 포스터 응답 마감 뒤). final=True 면 행사 직후 추천(10/6 민찬): 커피챗 계산과 같은 신호
    (테이블토크 만족도 · 그날 명함 교환 전부 · 포스터 응답 · 검색)를 반영해 추천 목록만 다시 만든다. 검색은 감쇠 없이 그날 것을 모두 쓴다.
    커피챗 뒤 만족도는 평가용이라 넣지 않는다(DATA_SPEC, 넣을지는 팀 결정 대기).
    커피챗 그룹은 원본 그대로 두고(_keep_groups), 테이블토크 · 커피챗 동석자와 이미 교환한 사람은 뺀다 → '오늘 못 만났지만 연락해 볼 만한 사람'.
    새 초안 버전(round=coffeechat, params.kind=final)으로 저장하고 운영자가 공개한다. 공개하면 원본 커피챗 버전은 retired 가 되고
    화면은 이 버전을 읽는다(그룹 · 번호는 같음). 최근 10분 쏠림 규칙(H-04, 웹)은 행사가 끝나면 최근 교환이 없어 저절로 꺼진다"""
    P = _people(repo, event_id, only_checked_in=True)
    late_plan = set() if final else _id_list(repo, COFFEECHAT_LATE_KEY)   # 늦참 예정: 체크인 전이어도 자리를 잡아 둔다
    if late_plan:
        have = {p["id"] for p in P}
        extra = [p for p in repo.participants(event_id) if p["id"] not in have and p["id"].lower() in late_plan]
        has_sid = repo.sids([p["id"] for p in extra]) if extra else {}
        P = P + [p for p in extra if p["id"] in has_sid]   # 주소가 없는 늦참 예정(전날 계산 뒤 추가)은 빼고 도착하면 늦게 온 사람 자리로(코드리뷰)
    # 일찍 나간다고 표시한 사람(checkins.left_at, 0019)은 커피챗 계산에서 뺀다 — 앉지도 않고 주도 선배 후보도 아니다(10/25 민찬 결정).
    #   커피챗 그룹 · 추천 목록에도 없고 남의 커피챗 추천에도 나오지 않는다. 공개 뒤에 나간 사람의 자리는 웹이 그대로 둔다(빈자리, 다시 계산하지 않음)
    #   행사 직후 추천(final)은 빼지 않는다(구현하며 정함): 원본 커피챗 그룹을 그대로 쓰고, 행사 뒤 연락할 사람 추천은 일찍 간 사람에게도 쓸모가 있다
    left_ids = set() if final else repo.left_checkins([p["id"] for p in P])
    skip_all = _coffee_skip(repo)
    skip_ids = set() if final else {p["id"] for p in P if p["id"].lower() in skip_all}   # 커피챗 불참으로 정해 둔 사람(COFFEECHAT_SKIP_KEY)
    P = [p for p in P if p["id"] not in left_ids and p["id"] not in skip_ids]
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
    #   안 고른 사람은 감점하지 않는다. 제출까지 2초도 안 걸린 답은 응답률에는 세고 반영에서는 뺀다
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
    # 목표 방향 T · 무게 sat_w (사람마다)
    #   고른 사람 없음          T = 동석자 평균, 무게 = 답 무게(최고였어요 1 · 좋았어요 0.33 · 별로였어요 −0.2 → 밀어냄)
    #   고른 사람 있음 · 답 > 0  T = 고른 사람 평균 × 50% + 나머지 동석자 평균 × 50%(나머지가 없으면 고른 사람만), 무게 = 답 무게
    #   고른 사람 있음 · 답 ≤ 0  T = 고른 사람 평균, 무게 = 0.33(테이블은 밀어내지 않고 고른 사람 쪽으로만 당김)
    d = O.shape[1]
    T = np.zeros((n, d))
    sat_w = np.zeros(n)
    for i in range(n):
        if not mates[i]:
            continue
        a = sw.get(sat.get(i), 0.0)
        if i not in picked:
            T[i], sat_w[i] = O[mates[i]].mean(0), a
            continue
        tp = O[picked[i]].mean(0)
        rest = [j for j in mates[i] if j not in picked[i]]
        if a > 0:
            T[i] = SAT_PICK_SHARE * tp + (1 - SAT_PICK_SHARE) * O[rest].mean(0) if rest else tp
            sat_w[i] = a
        else:
            T[i], sat_w[i] = tp, SAT_PICK_MIN_WEIGHT
    if fallback:                                                         # 대체 경로 = 만남 반영 없이 텍스트만
        O2, S2 = O, S
    else:
        O2 = O
        S2 = scoring.seek_toward(S, T, sat_w, beta)                    # 만족도 · 고른 사람 → Seek
        S2 = scoring.card_shift(S2, O, W, beta, by_weight=True)          # 명함 교환 → Seek

    a_np = scoring.directional(S2, O2)                                   # 포스터 반영 전 점수(B-05 검증용으로 같이 저장)
    seat_np = scoring.seat_directional(S2, O2)

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
                                                datetime.now(timezone.utc).timestamp(), decay_on=not final)
    if q_items and hasattr(enc, "encode"):
        S2 = searchm.apply_queries(S2, q_items, O, enc.encode, S_ref=S)   # 상한은 행사 전 저장된 Seek 기준
    else:
        query_stat["used"] = 0
    a = scoring.directional(S2, O2)

    is_host = np.array([bool(p.get("is_host")) for p in P])
    cohort = np.array([p["cohort"] if p.get("cohort") is not None else -1 for p in P])
    A = scoring.table_matrix(scoring.seat_directional(S2, O2), is_host, table_mode)
    A_np = scoring.table_matrix(seat_np, is_host, table_mode)
    seated, src, lp = np.ones(n, bool), None, None
    apart_swaps = 0
    late_ids = (repo.late_checkins(ids) | {pid for pid in ids if pid.lower() in late_plan}) if not final else set()
    is_late = np.array([pid in late_ids for pid in ids], bool)
    lead_seating = os.environ.get("COFFEE_LEAD_SEATING", COFFEE_LEAD_SEATING).strip() or COFFEE_LEAD_SEATING
    if lead_seating not in seating.LEAD_SEATING_MODES:
        raise ValueError(f"COFFEE_LEAD_SEATING={lead_seating!r} 는 facing · adjacent · free 중 하나여야 한다")
    seat_sum: dict[str, float] = {}
    if final:
        r, sizes, seated, src, lead, seat = _keep_groups(repo, ids, idx, event_id, forbid, cohort)   # 주도 선배 표시 · 좌석도 원본 그대로
    else:
        # 10테이블 고르게(적은 인원 리허설은 테이블당 4명이 되도록 테이블 수를 줄인다, even_sizes)
        sizes = seating.even_sizes(n, COFFEECHAT_TABLES)
        # 주도 선배(10/22 민찬 결정): 테이블마다 2명. 기수가 높은 순 2k + 4명 후보 중 하는 일(Offer) 벡터가 가까운 둘을 묶는다.
        #   기수가 먼저(10/25 민찬 결정): 뽑은 사람마다 가장 높은 기수보다 한 기수 아래일 때마다 감점해, 분야는 비슷한 기수끼리만 가른다.
        #   테이블토크에서 만난 둘은 되도록 묶지 않는다(seating.pick_leads)
        #   지연 체크인한 사람(늦게 오는 사람)은 주도 선배에서 뺀다(구현하며 정함: 선배가 늦으면 테이블을 이끌 사람이 없다)
        # 따로 앉힐 사람(COFFEECHAT_APART_KEY)은 금지 쌍에 더해 피하게 하고, 아래에서 한 번 더 확인한다. 추천 제외(met)에는 넣지 않는다
        lower = [pid.lower() for pid in ids]
        apart = np.zeros((n, n), bool)
        for g in _apart_groups(repo):
            gi = [i for i, pid in enumerate(lower) if pid in g]
            apart[np.ix_(gi, gi)] = True
        np.fill_diagonal(apart, False)
        lp = seating.pick_leads(O @ O.T, cohort, len(sizes), forbid=forbid | apart, exclude=is_late)
        anchors = {i: t for t, pair in enumerate(lp.pairs) for i in pair}
        # 나머지는 예전과 같은 커피챗 점수(A: 만족도 · 명함 · 포스터 · 검색 반영)로 채운다. 주도 선배는 옮기지 않으므로 잘 맞는 선배 테이블로 모인다
        r = seating.assign(A, is_host, cohort, forbid=forbid | apart, random_ratio=random_ratio, iters=iters, seed=seed,
                           sizes=sizes, cohort_penalty=COFFEECHAT_COHORT_PENALTY, cohort_cap=COFFEECHAT_COHORT_CAP,
                           anchors=anchors)
        lead = {i for pair in lp.pairs for i in pair}
        if apart.any():
            tb, apart_swaps = _split_apart(r.table, apart, forbid, A, cohort, lead)
            same = tb[:, None] == tb[None, :]
            r = dataclasses.replace(r, table=tb, forbid_hits=int((forbid & same).sum() // 2),
                                    cohort_over=seating.cohort_overflow(tb, cohort, cap=COFFEECHAT_COHORT_CAP))
        # 좌석 순서(테이블토크와 같은 seat_order). 주도 선배 둘의 자리를 먼저 정하고(마주 보게 등) 나머지를 이웃 점수 합 최대로
        seat = {}
        for t in range(len(sizes)):
            mem = [int(i) for i in np.where(r.table == t)[0]]
            fixed = seating.lead_fixed(lp.pairs[t], len(mem), lead_seating) if t < len(lp.pairs) else None
            order, total = seating.seat_order(A, mem, fixed=fixed)
            seat.update({int(i): k + 1 for k, i in enumerate(order)})
            seat_sum[str(t + 1)] = round(total, 3)
    if final:   # 행사 직후 추천: 불참 명단인 사람은 원본에 자리가 없어 앉지 않은 채 추천만 받는다 → '늦게 온 사람' 수에서 뺀다(코드리뷰)
        skip_ids = {pid for i, pid in enumerate(ids) if not seated[i] and pid.lower() in skip_all}
    late_n = int((~seated).sum()) - (len(skip_ids) if final else 0)
    params = {"kind": "final" if final else "coffeechat", "table_mode": table_mode, **_rec_params(P, intents, rec_mode), "beta": beta,
              "left": len(left_ids),                                   # 일찍 나간다고 표시해 뺀 사람 수(0019, final 은 0)
              "late_plan": len([pid for pid in ids if pid.lower() in late_plan]),   # 늦참 예정으로 자리를 잡아 둔 사람 수(COFFEECHAT_LATE_KEY)
              "skip": len(skip_ids),                                   # 커피챗 불참으로 정해 둬 뺀 사람 수(COFFEECHAT_SKIP_KEY). final 은 자리 없이 추천만 받은 불참자 수
              "apart_swaps": apart_swaps,                              # 따로 앉힐 사람(COFFEECHAT_APART_KEY)을 나누려고 맞바꾼 횟수(final 은 0)
              "response_rate": round(rate, 3), "fallback": fallback, "edges": int((W > 0).sum() // 2), "cards": card_stat,
              "sat_weights": sw, "sat_counts": dict(Counter(sat.values())), "sat_fast": sat_fast,
              "sat_picks": {"people": len(picked), "picked": sum(len(v) for v in picked.values())},
              "sat_legacy_columns": bool(getattr(repo, "sat_legacy_columns", False)),   # picks · elapsed_ms 칸 없는 예전 DB 로 대체했는지(코드리뷰)
              "poster_source": poster_source, "poster_weights": pw, "poster_beta": poster_beta, "poster_filter": poster_stat,
              "poster_answers": len(rows), "poster_people": len(set(poster_n) | set(poster_not)), "search": query_stat,
              "forbid_hits": r.forbid_hits, "cohort_over": r.cohort_over, "n": n, "groups": len(sizes),
              "group_sizes": dict(Counter(sizes)),
              **({"source_version": src["version"], "late": late_n, "leads": len(lead)} if final else {}),
              # 주도 선배: 인원 · 후보 수 · 2k 줄 밖에서 뽑은 수 · 뽑힌 사람보다 기수가 높은데 빠진 후보 수 · 테이블토크에서 만난 둘을 묶은 테이블 수
              **({"leads": len(lead), "lead_pool": len(lp.pool), "lead_beyond": lp.beyond, "lead_skipped": lp.skipped,
                  "lead_met": lp.met, "lead_seating": lead_seating, "late_checkins": int(is_late.sum()),
                  "seat_neighbor_sum": seat_sum} if lp else {})}
    reasons = _reasons(P, r.table + 1, A, r.random_seat, prev=prev, sat=None if fallback else sat,
                       exchanges=None if fallback else (W > 0).sum(1), posters=poster_n,
                       posters_not=poster_not, lead=lead, seat=seat)
    first_prefix = [int(sid[pid]["offer_sid"][0]) for pid in ids]
    cbv = sid[ids[0]]["codebook_version"]
    labels = {k[0]: lab for k, lab in repo.labels(cbv).items() if len(k) == 1}     # 운영진이 고친 최신 이름표
    v = _write_round(repo, "coffeechat", P, r.table + 1, a, A, tags, params, reasons, event_id, seat=seat,
                     orbit=_orbit(r.table + 1, first_prefix, labels, tags), A_no_poster=A_np, write=seated)

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
        pairs = [(i, j) for g in np.unique(r.table[seated]) for i in np.where(r.table == g)[0] for j in np.where(r.table == g)[0]
                 if i != j]
        ev = evm.sentences([(int(i), int(j)) for i, j in pairs], names, si_, oi, sim, si, oj, thr, tags)
        repo.insert("group_reasons", [{"version": v, "participant_id": ids[i], "target_id": ids[j], "kind": k, "text": t}
                                      for (i, j), (k, t) in ev.items()])
        n_reasons = len(ev)

    # 커피챗 버전 추천 목록(B-06). 테이블토크 · 커피챗 동석자와 명함을 교환한 사람은 뺀다
    same = seating.same_table_pairs(r.table)
    if final:
        # 커피챗이 시작되기 전에 나간 사람은 자리만 남고 실제로 동석자를 만나지 않았다 → 커피챗 동석을 '만난 사람'으로 보지 않는다(10/25 민찬 결정).
        # 커피챗 시작 = 원본 버전이 공개된(published_at) 뒤 처음 단계를 커피챗(coffeechat_seated)으로 바꾼 시각(event_log ops_phase).
        # 커피챗을 마치고 나간 사람(예: 17:00~17:25 커피챗 뒤 퇴장)은 만난 것이라 그대로 뺀다. 시작 시각을 모르면 동석을 그대로 '만난 사람'으로 둔다(보수적으로)
        # 테이블토크 동석(forbid) · 명함 교환(W)은 실제로 있었던 일이라 그대로 뺀다
        left_at = repo.left_times(ids)
        pub = src.get("published_at")
        start = min((t for t in map(datetime.fromisoformat, repo.phase_times("coffeechat_seated"))
                     if t > datetime.fromisoformat(pub)), default=None) if left_at and pub else None
        if start:
            g = np.array([pid in left_at and datetime.fromisoformat(left_at[pid]) < start for pid in ids])
            same[g, :] = False
            same[:, g] = False
    met = forbid | same | (W > 0)
    np.fill_diagonal(met, True)
    exposure = _write_recs(repo, v, P, ids, _rec_scores(S2, O2, a, P, intents, rec_mode), met, tags, intents,
                           [(c,) for c in first_prefix], n_exact, n_explore, seed)
    _heartbeat(repo, "final" if final else "coffeechat")
    return {"version": v, "final": final, "late": late_n, "left": len(left_ids), "n": n, "tables": len(sizes), "groups": len(sizes), "fallback": fallback,
            "response_rate": round(rate, 3), "forbid_hits": r.forbid_hits, "group_reasons": n_reasons,
            "leads": len(lead), "cohort_over": r.cohort_over,
            "exposure_min": int(exposure.min()), "exposure_max": int(exposure.max())}


LATE_TEXT = "늦게 와서 배정"


def coffeechat_late(repo, enc, participant_id: str, event_id: str = "dev", version: int | None = None,
                    table_mode: str = "min") -> dict:
    """커피챗 배정 공개 뒤에 처음 체크인한 사람(늦게 온 사람)의 자리(10/25 민찬 결정). 고르기만 하고 쓰지 않는다 — 자리는 웹이 쓴다.
    웹이 2 ~ 3초만 기다리므로 모델은 올리지 않는다(enc 가 None 이면 저장된 벡터만 쓴다).
    점수 = 행사 전 정보만: 저장된 벡터(sids, 없으면 프로필을 그 자리에서 임베딩)로 커피챗 배정과 같은 좌석 점수(seat_directional → table_matrix).
      테이블토크 · 포스터세션에 없었으므로 그날 신호(만족도 · 명함 · 포스터 · 검색)는 없고, 테이블토크 동석자 금지도 걸지 않는다
      (미리 정해 둔 테이블토크 동석자를 실제로 만나지 않았다. 10/25 민찬 결정)
    고르기(10/25 민찬 결정)
      1. 인원: 인원이 (가장 적은 테이블 + 1) 이하인 테이블만
      2. 그중 같은 기수가 상한(COFFEECHAT_COHORT_CAP)을 넘지 않는 테이블만. 그런 테이블이 없으면 1 의 테이블 전부
      3. 테이블 구성원과의 점수 평균이 가장 높은 곳(같으면 인원이 적은 곳 → 번호가 작은 곳)
    좌석 = 그 테이블의 (가장 큰 좌석 번호, 인원) 중 큰 쪽 + 1. 앉아 있는 사람 번호는 그대로. 주도 선배로 두지 않는다.
    일찍 나간다고 표시한 사람(checkins.left_at, 0019 · 10/25 민찬 결정): 본인이면 409(자리를 정하지 않는다). 테이블 구성원 중 나간 사람은
      인원 · 같은 기수 · 점수 평균에서 뺀다(그 자리는 비어 있다). 좌석 번호는 나간 사람 번호까지 포함한 다음 번호(구현하며 정함)
    version 을 안 주면 이 행사의 최신 공개 커피챗 버전. 행사 직후 추천(params.kind final)이 공개됐으면 409(행사가 끝난 뒤라 자리를 정하지 않는다)"""
    if version is None:
        v = repo.coffeechat_published(event_id)
        if v is None:
            raise ValueError("공개된 커피챗 배정이 없다")
        if (v.get("params") or {}).get("kind") == "final":
            raise ValueError("행사 직후 추천이 공개된 뒤라 커피챗 자리를 정하지 않는다")
        version = int(v["version"])
    rows = repo.version_members(version)
    if not rows:
        raise ValueError(f"커피챗 배정 {version} 에 자리가 없다")
    mine = next((m for m in rows if m["participant_id"] == participant_id), None)
    if mine is not None:                                                 # 이미 자리가 있으면 그대로 돌려준다
        return {"version": version, "already": True, "table_no": int(mine["table_no"]), "seat_no": mine.get("seat_no")}
    P = {p["id"]: p for p in repo.participants(event_id)}
    if participant_id not in P:
        raise ValueError("이 행사의 참가자가 아니다")
    left = repo.left_checkins([participant_id] + [m["participant_id"] for m in rows])
    if participant_id in left:
        raise ValueError("일찍 나간다고 표시한 사람이라 커피챗 자리를 정하지 않는다")
    if participant_id.lower() in _coffee_skip(repo):
        raise ValueError("커피챗 불참으로 정해 둔 사람이라 커피챗 자리를 정하지 않는다")

    members: dict[int, list[str]] = {}
    top_seat: dict[int, int] = {}
    n_rows: dict[int, int] = {}
    for m in rows:
        t = int(m["table_no"])
        members.setdefault(t, [])
        if m["participant_id"] not in left:                              # 나간 사람은 구성원에서 뺀다(빈자리)
            members[t].append(m["participant_id"])
        n_rows[t] = n_rows.get(t, 0) + 1
        top_seat[t] = max(top_seat.get(t, 0), int(m.get("seat_no") or 0))
    sid = repo.sids([participant_id] + [x for mem in members.values() for x in mem])
    if participant_id in sid:
        o0, s0 = np.array(sid[participant_id]["offer_vec"], float), np.array(sid[participant_id]["seek_vec"], float)
    elif enc is not None:                                                # 현장 등록자(주소 없음)는 프로필을 바로 임베딩
        prof = repo.profiles([participant_id])
        pr = prof.get(participant_id) or {}
        if not ((pr.get("offer_text") or "").strip() or (pr.get("seek_text") or "").strip() or pr.get("topic_tags")):
            raise ValueError("프로필이 비어 있어 잘 맞는 테이블을 고를 수 없다")   # 웹이 인원이 가장 적은 테이블로(구현하며 정함)
        O1, S1, _ = _embed(enc, [P[participant_id]], prof)
        o0, s0 = O1[0], S1[0]
    else:
        raise ValueError("이 사람의 저장된 벡터(주소)가 없고 모델이 아직 올라오지 않았다")
    have = [x for mem in members.values() for x in mem if x in sid and x in P]
    ids = [participant_id] + have
    col = {x: k for k, x in enumerate(ids)}
    O = unit(np.vstack([o0] + [np.array(sid[x]["offer_vec"], float) for x in have]))
    S = unit(np.vstack([s0] + [np.array(sid[x]["seek_vec"], float) for x in have]))
    is_host = np.array([bool(P[x].get("is_host")) for x in ids])
    A = scoring.table_matrix(scoring.seat_directional(S, O), is_host, table_mode)

    coh = P[participant_id].get("cohort")
    cand = []
    for t in sorted(members):
        js = [col[x] for x in members[t] if x in col]
        same = sum(1 for x in members[t] if coh is not None and (P.get(x) or {}).get("cohort") == coh)
        cand.append({"table_no": t, "size": len(members[t]), "same_cohort": same,
                     "mean": round(float(np.mean(A[0, js])), 4) if js else None, "_js": js})
    # 따로 앉힐 사람(COFFEECHAT_APART_KEY)이 이미 앉은 테이블은 고르지 않는다. 모든 테이블에 있으면 그대로(자리는 줘야 한다)
    mates = set().union(*[g - {participant_id.lower()} for g in _apart_groups(repo) if participant_id.lower() in g])
    away = [c for c in cand if not any(x.lower() in mates for x in members[c["table_no"]])]
    cand = away or cand
    lo = min(c["size"] for c in cand)
    pool = [c for c in cand if c["size"] <= lo + 1]
    fit = [c for c in pool if coh is None or c["same_cohort"] + 1 <= COFFEECHAT_COHORT_CAP]
    best = max(fit or pool, key=lambda c: (c["mean"] if c["mean"] is not None else -np.inf, -c["size"], -c["table_no"]))
    t = best["table_no"]
    seat_no = max(top_seat[t], n_rows[t]) + 1
    mate = max(best["_js"], key=lambda j: A[0, j]) if best["_js"] else None
    name = (P[ids[mate]].get("display_name") or "") if mate is not None else ""
    reason = {"text": f"{LATE_TEXT} · 잘 맞는 사람 {name}" if mate is not None else LATE_TEXT,
              "late_join": True, "table_no": t, "seat_no": seat_no,
              "best_mate": ids[mate] if mate is not None else None,
              "best_score": round(float(A[0, mate]), 3) if mate is not None else None,
              "avg_score": best["mean"], "cohort_over": not fit}
    return {"version": version, "already": False, "table_no": t, "seat_no": seat_no, "reason": reason,
            "tables": [{k: c[k] for k in ("table_no", "size", "same_cohort", "mean")} for c in cand]}


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
