"""테이블 배정. 성하 06_event_loop.py 의 assign_tables 를 옮기고 담금질을 증분 계산으로 바꿨다.

순서
  1. 테이블 수 · 크기 (5~6명)
  2. 호스트를 테이블마다 돌아가며 한 명씩
  3. 나머지를 무작위 순서로 한 명씩, 이미 앉은 사람과의 평균 점수가 가장 높은 테이블로 (한 자리마다 즉시 갱신)
     확률 random_ratio 로는 무작위 빈 테이블 — 점수가 약할 때만 이득 (연구 저장소 docs/31 G13)
  4. 같은 역할끼리 자리 바꾸기(담금질)로 목적 함수를 올린다. 무작위 자리는 바꾸지 않는다

목적 = 개인 만족 평균 + 2 × 하위 10% 평균 − 금지 쌍 5점 − 같은 기수 3명째부터 0.5점
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
COHORT_LIMIT = 2


def table_sizes(n: int, lo: int = 5, hi: int = 6) -> list[int]:
    k = max(1, math.ceil(n / hi))
    sizes = [hi] * k
    for i in range(hi * k - n):
        sizes[i % k] -= 1
    return sizes


@dataclass
class Seating:
    table: np.ndarray            # 사람 → 테이블 번호 (0부터)
    random_seat: np.ndarray      # 무작위로 앉힌 자리
    satisfaction: np.ndarray     # 개인 만족
    objective: float
    forbid_hits: int             # 금지 쌍이 같은 테이블에 앉은 수
    cohort_over: int             # 같은 기수 3명째부터 넘친 수
    iters: int


class _State:
    """증분 계산용 상태. 자리 하나를 바꿀 때 바뀐 두 테이블만 다시 센다(성하 원본은 매번 전체를 다시 셌다)."""

    def __init__(self, A, forbid, cohort, table, k):
        self.A, self.F, self.t, self.k = A, forbid, table.copy(), k
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
        self.forbid_hits = int(sum(forbid[np.ix_(list(m), list(m))].sum() for m in self.members) // 2)
        self.cohort_over = int(np.clip(self.cc - COHORT_LIMIT, 0, None).sum())

    def satisfaction(self):
        return self.ssum / np.maximum(1, self.cnt - 1)

    def objective(self, n10):
        sat = self.satisfaction()
        return (sat.mean() + 2 * np.partition(sat, n10 - 1)[:n10].mean()
                - FORBID_PENALTY * self.forbid_hits - COHORT_PENALTY * self.cohort_over)

    def _move_cohort(self, table, code, delta):
        if code < 0:
            return
        before = max(0, self.cc[table, code] - COHORT_LIMIT)
        self.cc[table, code] += delta
        self.cohort_over += max(0, self.cc[table, code] - COHORT_LIMIT) - before

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
           seed: int = 0, lo: int = 5, hi: int = 6) -> Seating:
    """A: 대칭 쌍 점수 (n, n). is_host: 호스트 여부. cohort: 기수(-1 은 모름). forbid: 같은 테이블 금지 쌍."""
    rng = random.Random(seed)
    n = len(A)
    sizes = table_sizes(n, lo, hi)
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

    st = _State(A, forbid, cohort, table, k)
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
    st = _State(A, forbid, cohort, best_t, k)
    return Seating(best_t, rand_seat, st.satisfaction(), float(best_v), st.forbid_hits, st.cohort_over, done)


def same_table_pairs(table: np.ndarray) -> np.ndarray:
    """같은 테이블에 앉은 쌍 (n, n) bool. 다음 라운드의 금지 쌍으로 쓴다."""
    M = table[:, None] == table[None, :]
    np.fill_diagonal(M, False)
    return M
