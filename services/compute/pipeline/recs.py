"""커피챗 개인 추천 목록과 테이블 소개.

추천 (성하 06_event_loop.py T7 을 옮김)
  점수는 scoring.rec_matrix 가 만든 것(기본 min, REC_SCORE=one_way 면 한 방향)
  이미 만난 사람(같은 테이블 · 명함 교환)은 뺀다
  정확 칸 + 탐색 칸. 탐색 칸은 아직 덜 노출된 사람. 목록 안 확장 칸 15% 는 견고했음(docs/29 F1)
  노출 상한 — 한 사람이 너무 많은 목록에 뜨지 않게 무작위 순서로 돌며 누적
  이유는 사실만 적는다 (공통 주제 태그 · 같은 궤도 · 찾는 관계를 상대가 줄 수 있음)
"""
from __future__ import annotations

import random
from collections import Counter

import numpy as np


def personal(a: np.ndarray, met: np.ndarray, n_exact: int = 10, n_explore: int = 2,
             cap: int | None = None, seed: int = 0) -> tuple[list[list[tuple[int, str]]], np.ndarray]:
    """사람마다 [(상대 번호, 'exact'|'explore'), …] 와 사람별 노출 횟수."""
    n = len(a)
    per = n_exact + n_explore
    cap = cap if cap is not None else max(per, int(np.ceil(per * 1.2)))
    rng = random.Random(seed)
    exposure = np.zeros(n, dtype=int)
    out: list[list[tuple[int, str]]] = [[] for _ in range(n)]
    order = list(range(n))
    rng.shuffle(order)
    for i in order:
        cand = [int(j) for j in np.argsort(-a[i]) if j != i and not met[i, j] and exposure[j] < cap]
        exact = cand[:n_exact]
        explore = sorted(cand[n_exact:], key=lambda j: (exposure[j], -a[i, j]))[:n_explore]
        for j in exact + explore:
            exposure[j] += 1
        out[i] = [(j, "exact") for j in exact] + [(j, "explore") for j in explore]
    return out, exposure


def reasons(i: int, j: int, topic_tags: list[list[str]], seek_intents: list[list[str]],
            give_intents: list[list[str]] | None, sid_prefix: list[tuple] | None) -> dict:
    """이유 칩. recs.reason(jsonb) 에 그대로 넣는다."""
    r: dict = {}
    common = sorted(set(topic_tags[i]) & set(topic_tags[j]))
    if common:
        r["common_topics"] = common
    if give_intents is not None:
        can_give = sorted(set(seek_intents[i]) & set(give_intents[j]))
        if can_give:
            r["they_can_give"] = can_give
    if sid_prefix is not None and sid_prefix[i] == sid_prefix[j]:
        r["same_orbit"] = True
    return r


def talk_prompts(members: list[int], topic_tags: list[list[str]], max_prompts: int = 3) -> list[str]:
    """테이블 대화거리. 두 명 이상 겹치는 주제를 많은 순으로. 테이블 이름표는 달지 않는다(너무 좁은 이름이 붙어서)."""
    cnt = Counter(t for m in members for t in set(topic_tags[m]))
    shared = [t for t, c in cnt.most_common() if c >= 2]
    prompts = [f"{t} 에 관심 있는 분이 {cnt[t]}명 있다. 요즘 보고 있는 것을 하나씩 나눠 본다" for t in shared[:max_prompts]]
    if not prompts:
        prompts = ["지금 하고 있는 일을 한 문장으로 소개하고, 오늘 찾는 사람을 말해 본다"]
    return prompts
