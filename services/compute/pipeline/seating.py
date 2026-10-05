"""테이블 배정. 성하 06_event_loop.py 의 assign_tables 를 옮기고 담금질을 증분 계산으로 바꿨다.

순서
  1. 테이블 수 · 크기. 커피챗은 5~6명(table_sizes). 테이블토크는 부르는 쪽이 sizes 로 준다(개발 지시서 v0.2 B-02: 8테이블 균등, even_sizes)
  2. 호스트를 테이블마다 돌아가며 한 명씩
  3. 나머지를 무작위 순서로 한 명씩, 이미 앉은 사람과의 평균 점수가 가장 높은 테이블로 (한 자리마다 즉시 갱신)
     확률 random_ratio 로는 무작위 빈 테이블 — 점수가 약할 때만 이득 (연구 저장소 docs/31 G13)
  4. 같은 역할끼리 자리 바꾸기(담금질)로 목적 함수를 올린다. 무작위 자리는 바꾸지 않는다

목적 = 개인 만족 평균 + 2 × 하위 10% 평균 − 금지 쌍 5점 − 같은 기수 초과 1명당 cohort_penalty
       같은 기수 상한 = 테이블 인원의 40% 내림(5~6명 2명 · 8~9명 3명 · 10명 4명). 기본 감점 0.5, 테이블토크는 5점(v0.2 B-02 '큰 감점')
       개인 만족 = 같은 테이블 동료와의 점수 평균
       하위 10% 항은 배정이 이미 잘 맞을 사람에게 몰리는 것(Gini 0.485 → 0.609, G11)을 누르려고 둔다
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

import numpy as np

FORBID_PENALTY = 5.0
COHORT_PENALTY = 0.5
COHORT_SHARE = 0.4               # 같은 기수는 테이블 인원의 40% 까지
MIN_TABLE = 4


def table_sizes(n: int, lo: int = 5, hi: int = 6) -> list[int]:
    k = max(1, math.ceil(n / hi))
    sizes = [hi] * k
    for i in range(hi * k - n):
        sizes[i % k] -= 1
    return sizes


def even_sizes(n: int, n_tables: int = 8) -> list[int]:
    """n 명을 n_tables 개 테이블에 고르게(크기 차이 1 이하). 테이블당 MIN_TABLE 명이 안 되면 테이블 수를 줄인다(적은 인원 시험용)."""
    k = max(1, min(n_tables, n // MIN_TABLE))
    return [n // k + (1 if i < n % k else 0) for i in range(k)]


def group_sizes(n: int, hi: int = 4) -> list[int]:
    """커피챗 첫 배치 그룹(v0.2 결정 10: 3~4명). 그룹 수 = n ÷ 4 올림, 크기 차이 1 이하. 12명 이상이면 전부 3~4명."""
    k = max(1, math.ceil(n / hi))
    return [n // k + (1 if i < n % k else 0) for i in range(k)]


def cohort_limit(size: int) -> int:
    """같은 기수 상한. 테이블 인원 × 40% 내림, 최소 1."""
    return max(1, int(COHORT_SHARE * size))


@dataclass
class Seating:
    table: np.ndarray            # 사람 → 테이블 번호 (0부터)
    random_seat: np.ndarray      # 무작위로 앉힌 자리
    satisfaction: np.ndarray     # 개인 만족
    objective: float
    forbid_hits: int             # 금지 쌍이 같은 테이블에 앉은 수
    cohort_over: int             # 같은 기수 상한을 넘친 사람 수
    iters: int


class _State:
    """증분 계산용 상태. 자리 하나를 바꿀 때 바뀐 두 테이블만 다시 센다(성하 원본은 매번 전체를 다시 셌다)."""

    def __init__(self, A, forbid, cohort, table, k, cohort_penalty=COHORT_PENALTY, cohort_cap=None):
        self.A, self.F, self.t, self.k, self.pen = A, forbid, table.copy(), k, cohort_penalty
        n = len(A)
        codes = {c: x for x, c in enumerate(sorted(set(cohort[cohort >= 0].tolist())))}
        self.c = np.array([codes.get(int(x), -1) for x in cohort])      # 기수 → 0.. (모름은 -1)
        self.members = [set(np.where(self.t == j)[0].tolist()) for j in range(k)]
        self.ssum = np.array([A[i, list(self.members[self.t[i]] - {i})].sum() for i in range(n)])
        self.cnt = np.array([len(self.members[self.t[i]]) for i in range(n)])
        self.cc = np.zeros((k, max(1, len(codes))), dtype=int)           # 테이블별 기수 인원
        for i in range(n):
            if self.c[i] >= 0:
                self.cc[self.t[i], self.c[i]] += 1
        # 자리 바꾸기는 테이블 인원을 바꾸지 않으므로 상한도 고정. cohort_cap 을 주면 모든 테이블에 같은 상한(커피챗 = 예전 규칙 2명)
        self.lim = np.array([cohort_cap if cohort_cap is not None else cohort_limit(len(m)) for m in self.members])
        self.forbid_hits = int(sum(forbid[np.ix_(list(m), list(m))].sum() for m in self.members) // 2)
        self.cohort_over = int(np.clip(self.cc - self.lim[:, None], 0, None).sum())

    def satisfaction(self):
        return self.ssum / np.maximum(1, self.cnt - 1)

    def objective(self, n10):
        sat = self.satisfaction()
        return (sat.mean() + 2 * np.partition(sat, n10 - 1)[:n10].mean()
                - FORBID_PENALTY * self.forbid_hits - self.pen * self.cohort_over)

    def _move_cohort(self, table, code, delta):
        if code < 0:
            return
        before = max(0, self.cc[table, code] - self.lim[table])
        self.cc[table, code] += delta
        self.cohort_over += max(0, self.cc[table, code] - self.lim[table]) - before

    def swap(self, i, j):
        A, F, p, q = self.A, self.F, self.t[i], self.t[j]
        Mp, Mq = list(self.members[p] - {i}), list(self.members[q] - {j})
        self.ssum[Mp] += A[Mp, j] - A[Mp, i]
        self.ssum[Mq] += A[Mq, i] - A[Mq, j]
        self.ssum[i] = A[i, Mq].sum()                                # i 는 이제 q 의 나머지와 앉는다
        self.ssum[j] = A[j, Mp].sum()
        self.forbid_hits += int(F[j, Mp].sum() - F[i, Mp].sum() + F[i, Mq].sum() - F[j, Mq].sum())
        self._move_cohort(p, self.c[i], -1); self._move_cohort(p, self.c[j], +1)
        self._move_cohort(q, self.c[j], -1); self._move_cohort(q, self.c[i], +1)
        self.members[p] = set(Mp) | {j}
        self.members[q] = set(Mq) | {i}
        self.t[i], self.t[j] = q, p


def assign(A: np.ndarray, is_host: np.ndarray, cohort: np.ndarray | None = None,
           forbid: np.ndarray | None = None, random_ratio: float = 0.0, iters: int = 20000,
           seed: int = 0, lo: int = 5, hi: int = 6, sizes: list[int] | None = None,
           cohort_penalty: float = COHORT_PENALTY, cohort_cap: int | None = None) -> Seating:
    """A: 대칭 쌍 점수 (n, n). is_host: 호스트 여부. cohort: 기수(-1 은 모름). forbid: 같은 테이블 금지 쌍.
    sizes 를 주면 그 크기대로(테이블토크 8테이블, 커피챗 3~4명 그룹), 안 주면 lo~hi 명.
    cohort_cap 을 주면 같은 기수 상한을 모든 테이블에 그 값으로, 안 주면 테이블 인원의 40%."""
    rng = random.Random(seed)
    n = len(A)
    sizes = list(sizes) if sizes is not None else table_sizes(n, lo, hi)
    assert sum(sizes) == n, (sizes, n)
    k = len(sizes)
    cohort = np.full(n, -1) if cohort is None else np.nan_to_num(np.asarray(cohort, float), nan=-1).astype(int)
    forbid = np.zeros((n, n), bool) if forbid is None else forbid.astype(bool)
    host = np.asarray(is_host, bool)

    table = np.full(n, -1)
    cap = list(sizes)
    rand_seat = np.zeros(n, bool)
    hosts = [i for i in range(n) if host[i]]
    rng.shuffle(hosts)
    for r, h in enumerate(hosts):                               # 호스트를 테이블마다 돌아가며
        t = r % k
        if cap[t] <= 0:
            t = max(range(k), key=lambda x: cap[x])
        table[h] = t
        cap[t] -= 1
    others = [i for i in range(n) if not host[i]]
    rng.shuffle(others)
    for o in others:                                            # 한 명씩, 이미 앉은 사람과의 평균 점수로
        open_t = [t for t in range(k) if cap[t] > 0]
        if random_ratio > 0 and rng.random() < random_ratio:
            t = rng.choice(open_t)
            rand_seat[o] = True
        else:
            def gain(t):
                mem = np.where(table == t)[0]
                if len(mem) == 0:
                    return 0.0
                return A[o, mem].mean() - FORBID_PENALTY * forbid[o, mem].sum()
            t = max(open_t, key=gain)
        table[o] = t
        cap[t] -= 1

    st = _State(A, forbid, cohort, table, k, cohort_penalty, cohort_cap)
    n10 = max(1, n // 10)
    cur = st.objective(n10)
    best_t, best_v = st.t.copy(), cur
    movable = [i for i in range(n) if not rand_seat[i]]
    done = 0
    for it in range(iters):
        temp = 0.3 * (0.01 / 0.3) ** (it / max(1, iters))
        i, j = rng.choice(movable), rng.choice(movable)
        if st.t[i] == st.t[j] or host[i] != host[j]:             # 같은 역할끼리만 바꿔 호스트 분포를 지킨다
            continue
        st.swap(i, j)
        v = st.objective(n10)
        done += 1
        if v > cur or rng.random() < math.exp((v - cur) / temp):
            cur = v
            if cur > best_v:
                best_v, best_t = cur, st.t.copy()
        else:
            st.swap(i, j)                                       # 되돌리기
    st = _State(A, forbid, cohort, best_t, k, cohort_penalty, cohort_cap)
    return Seating(best_t, rand_seat, st.satisfaction(), float(best_v), st.forbid_hits, st.cohort_over, done)


def same_table_pairs(table: np.ndarray) -> np.ndarray:
    """같은 테이블에 앉은 쌍 (n, n) bool. 다음 라운드의 금지 쌍으로 쓴다."""
    M = table[:, None] == table[None, :]
    np.fill_diagonal(M, False)
    return M


def seat_order(A: np.ndarray, members: list[int]) -> tuple[list[int], float]:
    """원형 테이블 좌석 순서(v0.2 B-03). 이웃한 두 사람의 쌍 점수 합이 가장 큰 순서를 정확히 찾는다.
    순서를 하나씩 다 보면 10명에 (10−1)!/2 = 181,440 가지지만, 같은 답을 Held-Karp(외판원 문제 동적 계획)로
    10명 기준 약 4만 번 비교로 낸다. 첫 자리(좌석 1)는 members[0]. 돌려주는 값 = (좌석 순서, 이웃 점수 합)."""
    m = list(members)
    k = len(m)
    W = A[np.ix_(m, m)]
    if k <= 1:
        return m, 0.0
    if k == 2:
        return m, float(W[0, 1])                          # 두 명이면 이웃은 한 쌍
    if k == 3:
        return m, float(W[0, 1] + W[1, 2] + W[2, 0])
    if k > EXACT_SEAT_MAX:
        return _seat_order_greedy(W, m)
    full = 1 << (k - 1)                                   # 0번(첫 자리)을 뺀 나머지의 부분집합
    dp = np.full((full, k), -np.inf)
    back = np.full((full, k), -1, dtype=int)
    for j in range(1, k):
        dp[1 << (j - 1), j] = W[0, j]
    for S in range(1, full):
        for j in range(1, k):
            cur = dp[S, j]
            if cur == -np.inf:
                continue
            for nx in range(1, k):
                bit = 1 << (nx - 1)
                if S & bit:
                    continue
                v = cur + W[j, nx]
                if v > dp[S | bit, nx]:
                    dp[S | bit, nx], back[S | bit, nx] = v, j
    S = full - 1
    last = max(range(1, k), key=lambda j: dp[S, j] + W[j, 0])
    best = float(dp[S, last] + W[last, 0])
    path = []
    while last > 0:
        path.append(last)
        S, last = S & ~(1 << (last - 1)), back[S, last]
    order = [0] + path[::-1]
    return [m[i] for i in order], best


EXACT_SEAT_MAX = 16              # 이보다 큰 테이블은 정확 계산 대신 근사(16명 0.3초, 18명 1.8초, 이후 급격히 늘어남)


def _seat_order_greedy(W: np.ndarray, m: list[int]) -> tuple[list[int], float]:
    """큰 테이블용 근사. 가장 가까운 이웃을 차례로 붙인 뒤 구간 뒤집기(2-opt)로 더 나아지지 않을 때까지 고친다."""
    k = len(m)
    order, left = [0], set(range(1, k))
    while left:
        nx = max(left, key=lambda j: W[order[-1], j])
        order.append(nx)
        left.remove(nx)
    ring = lambda o: sum(W[o[i], o[(i + 1) % k]] for i in range(k))
    best, improved = ring(order), True
    while improved:
        improved = False
        for i in range(1, k - 1):
            for j in range(i + 1, k):
                cand = order[:i] + order[i:j + 1][::-1] + order[j + 1:]
                v = ring(cand)
                if v > best + 1e-12:
                    order, best, improved = cand, v, True
    return [m[i] for i in order], float(best)


def cohort_overflow(table: np.ndarray, cohort: np.ndarray, cap: int | None = None) -> int:
    """테이블마다 같은 기수가 상한(cap, 없으면 인원 × 40%)을 넘친 사람 수의 합. 기수 모름(-1) · 자리 없음(-1)은 세지 않는다."""
    from collections import Counter
    size = Counter(int(t) for t in table if t >= 0)
    c = Counter((int(t), int(x)) for t, x in zip(table, cohort) if t >= 0 and x >= 0)
    return sum(max(0, v - (cap if cap is not None else cohort_limit(size[t]))) for (t, _), v in c.items())
