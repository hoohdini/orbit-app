"""리허설 정확도 — 배정에 쓴 점수(pair_scores)가 실제 반응과 맞았는가.

두 가지를 잰다
  A. 사람별 정확도 (주)   같은 테이블 동석자 중 "얻은 게 있었던 분" 으로 누른 사람의 점수가 안 누른 사람보다 높았나.
                         사람마다 재서 평균. 전부 누르거나 아무도 안 누른 사람은 비교할 차이가 없어 빠진다.
                         필요한 표(누른 동석자)가 아직 스키마에 없다 → picks 인자로 받는다
  B. 만족도 구분 (보조)   "새로 얻은 게 있었다(gained)" 를 고른 사람의 동석자 평균 점수가, "즐거웠다 · 안 맞았다" 를 고른 사람보다
                         높을 확률. "잘 모르겠다" 는 뺀다. satisfaction 표만으로 바로 잴 수 있다.
                         사람당 답 하나라 신호가 약하다. A 가 없을 때만 쓴다
점수는 세 가지를 나란히 — score(배정에 쓴 결합값) · score_ab 쪽 한 방향 · 두 방향 평균. 어느 쪽이 맞았는지 비교한다.

판정 기준은 노션 9/26 제안서 2-7 — 리허설은 0.5 보다 확실히 높은지만 본다(구간 하한 > 0.5).
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

KINDS = ("score", "one_way", "avg")


def _pair_lookup(pair_scores: list[dict]) -> dict[tuple[str, str], dict[str, float]]:
    """(평가자, 상대) → 점수들. one_way 는 평가자 쪽에서 본 한 방향(평가자의 Seek ↔ 상대 Offer)."""
    d = {}
    for r in pair_scores:
        a, b = r["a"], r["b"]
        ab, ba = r.get("score_ab"), r.get("score_ba")
        both = {"score": r["score"], "avg": (ab + ba) / 2 if ab is not None and ba is not None else r["score"]}
        d[(a, b)] = {**both, "one_way": ab if ab is not None else r["score"]}
        d[(b, a)] = {**both, "one_way": ba if ba is not None else r["score"]}
    return d


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
    for kind in KINDS:
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


POS, NEG = {"gained"}, {"enjoyed", "mismatch"}   # unsure 는 어느 쪽도 아니라 뺀다


def satisfaction_auc(pair_scores, members, satisfaction: dict[str, str]) -> dict:
    """satisfaction = {사람: 선택지 키}. gained 인 사람의 동석자 평균 점수가 enjoyed · mismatch 인 사람보다 높을 확률. 보조 지표."""
    P, mates = _pair_lookup(pair_scores), _tables(members)
    out = {}
    for kind in KINDS:
        pos, neg = [], []
        for p, c in satisfaction.items():
            ms = [q for q in mates.get(p, []) if (p, q) in P]
            if not ms or (c not in POS and c not in NEG):
                continue
            (pos if c in POS else neg).append(np.mean([P[(p, q)][kind] for q in ms]))
        auc = float(np.mean([(x > y) + 0.5 * (x == y) for x in pos for y in neg])) if pos and neg else float("nan")
        out[kind] = {"구분 정확도": auc, "얻음": len(pos), "못 얻음": len(neg)}
    return out
