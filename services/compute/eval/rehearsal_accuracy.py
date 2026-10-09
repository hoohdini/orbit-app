"""리허설 정확도 — 배정에 쓴 점수(pair_scores)가 실제 반응과 맞았는가.

두 가지를 잰다
  A. 사람별 정확도 (주)   같은 테이블 동석자 중 "얻은 게 있었던 분" 으로 누른 사람의 점수가 안 누른 사람보다 높았나.
                         사람마다 재서 평균. 전부 누르거나 아무도 안 누른 사람은 비교할 차이가 없어 빠진다.
                         필요한 표(누른 동석자)가 아직 스키마에 없다 → picks 인자로 받는다
  B. 만족도 구분 (보조)   "새로 얻은 게 있었다(gained)" 를 고른 사람의 동석자 평균 점수가, "관심사와 조금 달랐다 · 안 맞았다" 를 고른 사람보다
                         높을 확률. "잘 모르겠다" 는 뺀다. satisfaction 표만으로 바로 잴 수 있다.
                         사람당 답 하나라 신호가 약하다. A 가 없을 때만 쓴다
점수는 세 가지를 나란히 — score(배정에 쓴 결합값) · score_ab 쪽 한 방향 · 두 방향 평균. 어느 쪽이 맞았는지 비교한다.
커피챗 버전에 score_no_poster(포스터 반영 없이 낸 점수, 0009)가 있으면 no_poster 도 나란히 → 포스터 반영이 맞히는 데 도왔는지(v0.2 B-05 · B-13).

v0.2 B-13 에서 더한 것
  picks_from_exchanges  동석자와 명함을 교환했으면 '얻은 게 있었던 분' 대신 쓸 수 있는 양성 쌍. 첫 대화 체크(first_meet)가 생기면 그것만
  concentration         쏠림 지표. 받은 명함 수의 지니 계수(0 = 고르게, 1 = 한 사람에게 몰림)와 한 장도 못 받은 사람 수
  추천 수락률을 미션 ② 완료 전후로 나눠 보는 것은 추천 노출 기록(rec_impressions, B-10)이 생긴 뒤에 더한다

판정 기준은 노션 9/26 제안서 2-7 — 리허설은 0.5 보다 확실히 높은지만 본다(구간 하한 > 0.5).
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

KINDS = ("score", "one_way", "avg", "no_poster")


def _pair_lookup(pair_scores: list[dict]) -> dict[tuple[str, str], dict[str, float]]:
    """(평가자, 상대) → 점수들. one_way 는 평가자 쪽에서 본 한 방향(평가자의 Seek ↔ 상대 Offer)."""
    d = {}
    for r in pair_scores:
        a, b = r["a"], r["b"]
        ab, ba = r.get("score_ab"), r.get("score_ba")
        both = {"score": r["score"], "avg": (ab + ba) / 2 if ab is not None and ba is not None else r["score"]}
        if r.get("score_no_poster") is not None:
            both["no_poster"] = r["score_no_poster"]
        d[(a, b)] = {**both, "one_way": ab if ab is not None else r["score"]}
        d[(b, a)] = {**both, "one_way": ba if ba is not None else r["score"]}
    return d


def _kinds(P) -> tuple[str, ...]:
    """이 버전에 있는 점수 종류만(no_poster 는 커피챗 버전에만 있다)."""
    return tuple(k for k in KINDS if not P or k in next(iter(P.values())))


def _tables(members: list[dict]) -> dict[str, list[str]]:
    by_t = defaultdict(list)
    for m in members:
        by_t[m["table_no"]].append(m["participant_id"])
    mates = {}
    for g in by_t.values():
        for p in g:
            mates[p] = [q for q in g if q != p]
    return mates


def _boot(vals: np.ndarray, n=2000, seed=0) -> list[float]:
    rng = np.random.default_rng(seed)
    if len(vals) == 0:
        return [float("nan")] * 2
    b = [vals[rng.integers(0, len(vals), len(vals))].mean() for _ in range(n)]
    return [float(x) for x in np.percentile(b, [2.5, 97.5])]


def per_person_accuracy(pair_scores, members, picks: set[tuple[str, str]], raters: set[str] | None = None) -> dict:
    """picks = {(누른 사람, 눌린 동석자)}. raters = 피드백 화면에 응답한 사람(안 주면 누른 기록이 있는 사람)."""
    P, mates = _pair_lookup(pair_scores), _tables(members)
    raters = raters if raters is not None else {a for a, _ in picks}
    out = {}
    for kind in _kinds(P):
        accs = []
        for p in raters:
            ms = [q for q in mates.get(p, []) if (p, q) in P]
            pos = [P[(p, q)][kind] for q in ms if (p, q) in picks]
            neg = [P[(p, q)][kind] for q in ms if (p, q) not in picks]
            if not pos or not neg:
                continue
            accs.append(np.mean([(x > y) + 0.5 * (x == y) for x in pos for y in neg]))
        accs = np.array(accs)
        lo, hi = _boot(accs)
        out[kind] = {"정확도": float(accs.mean()) if len(accs) else float("nan"), "95%": [lo, hi],
                     "사람": int(len(accs)), "판정": "0.5 보다 높음" if lo > 0.5 else "구분 불가"}
    return out


POS, NEG = {"gained"}, {"different", "mismatch"}   # unsure 는 어느 쪽도 아니라 뺀다


def satisfaction_auc(pair_scores, members, satisfaction: dict[str, str]) -> dict:
    """satisfaction = {사람: 선택지 키}. gained 인 사람의 동석자 평균 점수가 different · mismatch 인 사람보다 높을 확률. 보조 지표."""
    P, mates = _pair_lookup(pair_scores), _tables(members)
    out = {}
    for kind in _kinds(P):
        pos, neg = [], []
        for p, c in satisfaction.items():
            ms = [q for q in mates.get(p, []) if (p, q) in P]
            if not ms or (c not in POS and c not in NEG):
                continue
            (pos if c in POS else neg).append(np.mean([P[(p, q)][kind] for q in ms]))
        auc = float(np.mean([(x > y) + 0.5 * (x == y) for x in pos for y in neg])) if pos and neg else float("nan")
        out[kind] = {"구분 정확도": auc, "얻음": len(pos), "못 얻음": len(neg)}
    return out


def picks_from_exchanges(card_rows: list[dict], members: list[dict]) -> set[tuple[str, str]]:
    """같은 테이블 동석자와 명함을 교환한 쌍 → {(사람, 동석자)} 양방향. 확인 대기(status=pending)는 뺀다.
    첫 대화 체크(first_meet)로 거르지 않는다. 0010 부터 모든 행에 그 칸이 있고 질문은 건너뛸 수 있어서, 거르면 아무도 안 답한 행사에서
    쌍이 0이 된다(10/9 개발 DB 시험에서 발견). 계산 서비스도 체크 여부와 상관없이 교환을 같게 본다(10/5 민찬 결정)."""
    mates = _tables(members)
    rows = [r for r in card_rows if (r.get("status") or "confirmed") != "pending"]
    out = set()
    for r in rows:
        a, b = r["scanner_id"], r["scanned_id"]
        if b in mates.get(a, []):
            out.add((a, b))
            out.add((b, a))
    return out


def gini(x) -> float:
    """지니 계수. 0 = 모두 같음, 1 에 가까울수록 몇 명에게 몰림."""
    v = np.sort(np.asarray(x, dtype=float))
    if len(v) == 0 or v.sum() == 0:
        return 0.0
    n = len(v)
    return float((2 * np.arange(1, n + 1) - n - 1) @ v / (n * v.sum()))


def concentration(card_rows: list[dict], ids: list[str]) -> dict:
    """받은 명함 수(받은 쪽 = scanned_id)의 쏠림. v0.2 A-01 운영 지표(apps/web/app/api/ops/status/route.ts)와 정확히 같은 정의 —
    source='auto'(명찰 QR 찍기만 해도 생기는 행) 는 빼고, status == 'confirmed' 인 것만 받은 것으로 센다."""
    got = {p: 0 for p in ids}
    for r in card_rows:
        if r.get("source") == "auto":
            continue
        if (r.get("status") or "confirmed") != "confirmed":
            continue
        if r.get("scanned_id") in got:
            got[r["scanned_id"]] += 1
    vals = list(got.values())
    return {"지니": round(gini(vals), 3), "못 받은 사람": sum(1 for v in vals if v == 0), "사람": len(vals)}
