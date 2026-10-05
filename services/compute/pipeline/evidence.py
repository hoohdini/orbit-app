"""커피챗 그룹 구성원 카드의 근거 한 줄(개발 지시서 v0.2 B-07)과 테이블 · 그룹 라벨(B-08).

근거 한 줄 — 확인 가능한 사실과 프로필 원문만 쓴다. 점수 · 순위 · 대화 지시("~에 대해 물어보세요")는 쓰지 않는다.
  보는 사람 i, 카드의 상대 j 마다 아래 순서로 처음 맞는 하나만 고른다. 아무것도 안 맞으면 근거를 비운다(억지 문장 금지)
  1. 내가 찾는 것 ↔ 상대가 하는 일   i 의 '찾는 사람' 문장들과 j 의 '하는 일' 문장들 중 가장 가까운 짝이 기준 이상이면
     "{j}님 '{j 하는 일 원문}' · {i}님이 찾는 것 '{i 찾는 사람 원문}'"
  2. 상대가 찾는 것 ↔ 내가 하는 일   반대 방향도 같은 방식
     "{i}님 '{i 하는 일 원문}' · {j}님이 찾는 것 '{j 찾는 사람 원문}'"
  지시서 문형("…님은 '…', …님은 '…'을 찾고 계세요")은 원문이 '찾는다' · '듣고 싶다' 처럼 동사로 끝나면
  "'…찾는다'을 찾고 계세요" 가 되어(가상 70명 실행에서 확인) 원문 뒤에 동사를 붙이지 않는 문형으로 바꿨다(10/5, 팀 확인 필요)
  3. 공통 관심 태그                   "두 분 모두 {태그}에 관심이 있어요" (태그는 최대 2개)
  기준 = 그날 체크인한 사람 전체의 (i, j) 쌍에서 1 의 유사도를 모아 상위 30% 가 되는 값. 문장마다 하나씩 벡터를 만든다(사람 평균이 아니라)
  1 · 2 를 3 보다 앞에 둔 이유: 태그는 겹치는 사람이 많아 덜 구체적이다

라벨 — 구성원 주소 첫자리 이름표 중 가장 많은 것. 동률이거나 이름표가 없으면 구성원 둘 이상이 가진 관심 태그 상위 1~2개.
  데모는 테이블 이름을 일부러 달지 않았으므로 궤도 화면 전용(tables_meta.orbit_label)으로만 쓴다
"""
from __future__ import annotations

from collections import Counter

import numpy as np

from .embed import split_items, unit

TOP_SHARE = 0.30
QUOTE_MAX = 60


def _quote(s: str) -> str:
    s = s.strip()
    return s if len(s) <= QUOTE_MAX else s[:QUOTE_MAX - 1].rstrip() + "…"


def item_vectors(encode, texts: list[str]) -> tuple[list[list[str]], list[np.ndarray]]:
    """사람마다 문장 목록과 문장별 단위 벡터. encode(문장 목록) → (문장 수, 차원)."""
    items = [split_items(t or "") for t in texts]
    flat = [s for it in items for s in it]
    V = unit(np.asarray(encode(flat), dtype=float)) if flat else np.zeros((0, 1))
    out, k = [], 0
    for it in items:
        out.append(V[k:k + len(it)])
        k += len(it)
    return items, out


def best_match(seek_v: list[np.ndarray], offer_v: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """sim[i, j] = i 의 찾는 문장 × j 의 하는 일 문장 중 가장 높은 cos, 그 문장 번호 두 개. 문장이 없으면 -inf."""
    n = len(seek_v)
    sim = np.full((n, n), -np.inf)
    si, oj = np.zeros((n, n), int), np.zeros((n, n), int)
    for i in range(n):
        if not len(seek_v[i]):
            continue
        for j in range(n):
            if i == j or not len(offer_v[j]):
                continue
            M = seek_v[i] @ offer_v[j].T
            a, b = np.unravel_index(int(np.argmax(M)), M.shape)
            sim[i, j], si[i, j], oj[i, j] = M[a, b], a, b
    return sim, si, oj


def threshold(sim: np.ndarray, share: float = TOP_SHARE) -> float:
    v = sim[np.isfinite(sim)]
    return float(np.quantile(v, 1 - share)) if len(v) else np.inf


def sentences(pairs: list[tuple[int, int]], names: list[str], seek_items: list[list[str]], offer_items: list[list[str]],
              sim: np.ndarray, si: np.ndarray, oj: np.ndarray, thr: float,
              tags: list[list[str]]) -> dict[tuple[int, int], tuple[str, str]]:
    """(보는 사람, 상대) 쌍마다 (종류, 문장). 근거가 없는 쌍은 빠진다."""
    out = {}
    for i, j in pairs:
        if np.isfinite(sim[i, j]) and sim[i, j] >= thr:
            out[(i, j)] = ("seek_offer", f"{names[j]}님 '{_quote(offer_items[j][oj[i, j]])}' · "
                                         f"{names[i]}님이 찾는 것 '{_quote(seek_items[i][si[i, j]])}'")
        elif np.isfinite(sim[j, i]) and sim[j, i] >= thr:
            out[(i, j)] = ("offer_seek", f"{names[i]}님 '{_quote(offer_items[i][oj[j, i]])}' · "
                                         f"{names[j]}님이 찾는 것 '{_quote(seek_items[j][si[j, i]])}'")
        else:
            common = [t for t in tags[i] if t in set(tags[j])][:2]
            if common:
                out[(i, j)] = ("common_tags", f"두 분 모두 {', '.join(common)}에 관심이 있어요")
    return out


def group_label(members: list[int], first_prefix: list[int | None], labels: dict[int, str],
                tags: list[list[str]]) -> tuple[int | None, str | None]:
    """(대표 주소 첫자리 또는 None, 라벨 또는 None)."""
    cnt = Counter(first_prefix[m] for m in members if first_prefix[m] is not None).most_common()
    if cnt and (len(cnt) == 1 or cnt[0][1] > cnt[1][1]) and labels.get(cnt[0][0]):
        return int(cnt[0][0]), labels[cnt[0][0]]
    tc = Counter(t for m in members for t in set(tags[m]))
    top = [t for t, c in tc.most_common(2) if c >= 2]
    return None, (", ".join(top) if top else None)
