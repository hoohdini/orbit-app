"""pipeline 단위 시험. 모델 없이 가짜 벡터 70명으로 돈다.

실행  cd services/compute && python -m pytest tests -q      (pytest 없으면 python tests/test_pipeline.py)
"""
from __future__ import annotations

import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pipeline import codebook, recs, scoring, seating  # noqa: E402
from pipeline.embed import clean_prefix, split_items, offer_items, seek_items, unit  # noqa: E402

N, DIM, N_HOST = 70, 64, 8


def fake_people(seed=0):
    """주제 5개 주변에 모인 Offer · Seek 벡터. 호스트 8명, 기수 10~14."""
    rng = np.random.default_rng(seed)
    topics = rng.normal(size=(5, DIM))
    t_off = rng.integers(0, 5, N)
    t_seek = np.where(rng.random(N) < 0.6, t_off, rng.integers(0, 5, N))
    O = unit(topics[t_off] + 0.8 * rng.normal(size=(N, DIM)))
    S = unit(topics[t_seek] + 0.8 * rng.normal(size=(N, DIM)))
    is_host = np.zeros(N, bool)
    is_host[:N_HOST] = True
    cohort = rng.integers(10, 15, N)
    tags = [[f"주제{t}"] for t in t_off]
    return O, S, is_host, cohort, tags


def test_split_items():
    assert split_items("추천을 연구한다. 파이썬을 쓴다\n축구 동아리") == ["추천을 연구한다.", "파이썬을 쓴다", "축구 동아리"]
    assert offer_items("", ["추천"]) == ["관심 주제: 추천"]
    assert seek_items("", ["멘토링"]) == []                      # 빈 Seek 는 태그만으로 만들지 않는다


def test_clean_prefix():
    """.env 를 읽는 방식(source · docker --env-file)에 따라 끝 공백이 달라도 접두사는 하나로 맞춘다."""
    assert clean_prefix("query:") == clean_prefix("query: ") == clean_prefix(" query:  ") == "query: "
    assert clean_prefix("passage:") == "passage: "
    assert clean_prefix("") == ""


def test_table_sizes():
    for n in (5, 12, 49, 70, 71, 75):
        s = seating.table_sizes(n)
        assert sum(s) == n and all(5 <= x <= 6 for x in s), (n, s)


def test_scoring_rules():
    O, S, is_host, _, _ = fake_people()
    a = scoring.directional(S, O)
    for mode in ("min", "avg", "harmonic"):
        c = scoring.combine(a, mode)
        assert np.allclose(c, c.T) and np.allclose(np.diag(c), 0)
    A = scoring.table_matrix(a, is_host, "min")
    s, h = N_HOST, 0                                           # 학생 · 호스트 쌍은 학생 쪽 한 방향
    assert np.isclose(A[s, h], a[s, h]) and np.isclose(A[h, s], a[s, h])
    assert A[0, 1] == 0                                        # 호스트끼리 0
    assert np.allclose(A, A.T)


def test_seat_directional():
    O, S, *_ = fake_people()
    assert np.allclose(scoring.pair_directional(S, O), scoring.directional(S, O))     # 보정 없음 = 예전 점수
    m = scoring.pair_directional(S, O, center=True, topic_weight=0.5)
    off = ~np.eye(len(O), dtype=bool)
    assert np.allclose(np.diag(m), 0) and abs(m[off].mean()) < 1e-9                 # 표준화 두 개의 평균이라 평균 0
    for k in ("SEAT_CENTER", "SEAT_TOPIC_WEIGHT"):
        os.environ.pop(k, None)
    assert np.allclose(scoring.seat_directional(S, O), m)                             # 기본 = 평균 빼기 + 분야 0.5
    os.environ.update(SEAT_CENTER="0", SEAT_TOPIC_WEIGHT="0")
    assert np.allclose(scoring.seat_directional(S, O), scoring.directional(S, O))     # 예전 방식으로 되돌리기
    for k in ("SEAT_CENTER", "SEAT_TOPIC_WEIGHT"):
        os.environ.pop(k)


def test_rec_matrix_modes():
    O, S, *_ = fake_people()
    a = scoring.directional(S, O)
    assert np.allclose(scoring.rec_matrix(a, "one_way"), a)
    assert np.allclose(scoring.rec_matrix(a, "min"), np.minimum(a, a.T))
    os.environ.pop("REC_SCORE", None)
    assert np.allclose(scoring.rec_matrix(a), np.minimum(a, a.T))      # 기본은 min


def test_blank_seek():
    O, S, *_ = fake_people()
    blank = np.zeros(N, bool)
    blank[5] = True
    S2 = scoring.fill_blank_seek(S, O, blank)
    assert np.allclose(S2[5], O[5]) and np.allclose(S2[6], S[6])


def test_even_sizes_and_cohort_limit():
    assert seating.even_sizes(72) == [8] * 9                          # 9테이블 균등(10/21 민찬 결정, 2~10번)
    assert seating.even_sizes(70) == [8] * 7 + [7] * 2               # 인원 차 1 이하
    assert seating.even_sizes(20) == [4] * 5                          # 적으면 테이블당 4명 이상
    assert [seating.cohort_limit(k) for k in (5, 6, 8, 9, 10)] == [2, 2, 3, 3, 4]   # 40% 내림. 5~6명은 예전 규칙(2명)과 같음


def test_tabletalk_sizes_and_cohort_cap():
    """테이블토크처럼 sizes 와 큰 기수 감점을 주면 정한 크기대로 앉히고 같은 기수 40% 를 넘기지 않는다."""
    O, S, is_host, cohort, _ = fake_people()
    A = scoring.table_matrix(scoring.directional(S, O), is_host)
    sizes = seating.even_sizes(N)
    r = seating.assign(A, is_host, cohort, iters=20000, seed=1, sizes=sizes, cohort_penalty=5.0)
    assert sorted(np.bincount(r.table).tolist()) == sorted(sizes)
    assert r.cohort_over == 0 == seating.cohort_overflow(r.table, cohort)
    hosts = np.bincount(r.table[is_host], minlength=len(sizes))
    assert hosts.max() - hosts.min() <= 1


def test_uneven_cohort_limits_incremental():
    """테이블마다 기수 상한이 다를 때(8 · 9 · 10명) 자리 바꾸기 증분 계산이 처음부터 다시 센 값과 같은지."""
    rng = np.random.default_rng(3)
    for trial in range(10):
        sizes = [int(x) for x in rng.integers(4, 11, 6)]
        n = sum(sizes)
        M = rng.normal(size=(n, n)); A = (M + M.T) / 2
        cohort = rng.integers(-1, 4, n)
        t = np.repeat(np.arange(len(sizes)), sizes); rng.shuffle(t)
        st = seating._State(A, np.zeros((n, n), bool), cohort, t, len(sizes), 5.0)
        for _ in range(300):
            i, j = rng.integers(0, n, 2)
            if st.t[i] != st.t[j]:
                st.swap(i, j)
        fresh = seating._State(A, np.zeros((n, n), bool), cohort, st.t, len(sizes), 5.0)
        assert st.cohort_over == fresh.cohort_over == seating.cohort_overflow(st.t, cohort)
        assert np.allclose(st.ssum, fresh.ssum)


def test_group_sizes():
    assert seating.group_sizes(62) == [4] * 14 + [3] * 2               # 62 = 4 × 14 + 3 × 2
    assert all(3 <= x <= 4 for n in range(12, 90) for x in seating.group_sizes(n))
    assert seating.group_sizes(5) == [3, 2]


def test_anchors_stay_and_pull_members():
    """anchors(커피챗 주도 선배)는 처음 자리 그대로, 나머지는 크기 · 호스트 균등을 지키며 잘 맞는 anchor 테이블로 모인다."""
    O, S, is_host, cohort, _ = fake_people()
    A = scoring.table_matrix(scoring.directional(S, O), is_host)
    sizes = seating.even_sizes(N, 10)
    anchors = {i: t for t, i in enumerate(range(N - 20, N))}       # 끝 20명을 테이블마다 두 명씩(0~9 · 0~9)
    anchors = {i: t % 10 for i, t in anchors.items()}
    anchors[0] = 3                                                 # 호스트 anchor 도 셈에 넣어 호스트 균등을 지킨다
    r = seating.assign(A, is_host, cohort, iters=20000, seed=1, sizes=sizes, cohort_penalty=0.5, cohort_cap=3, anchors=anchors)
    assert all(r.table[i] == t for i, t in anchors.items())
    assert sorted(np.bincount(r.table).tolist()) == sorted(sizes)
    hosts = np.bincount(r.table[is_host], minlength=len(sizes))
    assert hosts.max() - hosts.min() <= 1
    free = [i for i in range(N) if i not in anchors]
    own = np.mean([A[i, [j for j in anchors if r.table[j] == r.table[i]]].mean() for i in free])
    assert own > np.mean(A[np.ix_(free, list(anchors))])            # 내 테이블 선배와의 점수 > 선배 전체 평균
    # anchors 가 없으면 예전(ab2f799, anchors 추가 전) assign 과 같은 배정. 그 코드로 같은 입력 · 시드를 돌린 결과를 박아 둔다
    before = "5270631479098396356135321464402451387684682068879982717450912520315709"
    for kw in ({}, {"anchors": {}}, {"anchors": None}):
        r0 = seating.assign(A, is_host, cohort, iters=2000, seed=1, sizes=sizes, cohort_penalty=0.5, cohort_cap=3, **kw)
        assert "".join(str(x) for x in r0.table) == before, kw


def test_pick_leads_seniority_and_field():
    """주도 선배: 기수가 높은(숫자가 작은) 사람 위주, 분야가 같은 둘끼리, 이미 만난 둘은 피함, 분야가 꼭 맞으면 조금 아래 사람도."""
    rng = np.random.default_rng(1)
    k, n, DIMS = 4, 30, 8
    field = np.array([t % k for t in range(n)])
    F = unit(np.eye(DIMS)[field] + 0.05 * rng.normal(size=(n, DIMS)))
    F = F @ F.T
    cohort = np.arange(n) + 1                                      # 0번 = 1기(가장 높음)
    cohort[n - 1] = -1                                             # 교수(기수 없음)는 후보가 아님
    lp = seating.pick_leads(F, cohort, k)
    used = [i for p in lp.pairs for i in p]
    assert len(lp.pairs) == k and len(set(used)) == 2 * k
    assert all(field[a] == field[b] for a, b in lp.pairs)          # 분야가 같은 둘
    assert lp.beyond == 0 and sorted(used) == list(range(2 * k))   # 위 8명이 분야 넷에 둘씩이면 그 8명
    assert len(lp.pool) == 2 * k + seating.LEAD_SLACK and n - 1 not in lp.pool
    # 분야 0 이 위 8명 중 한 명뿐이어도(4번을 분야 1 로) 기수가 4 이상 아래인 분야 0 후보로 내려가지 않는다(10/25 민찬 결정: 기수가 먼저)
    field2 = field.copy(); field2[4] = 1
    F2 = unit(np.eye(DIMS)[field2] + 0.05 * rng.normal(size=(n, DIMS))); F2 = F2 @ F2.T
    lp2 = seating.pick_leads(F2, cohort, k)
    assert lp2.beyond == 0 and sorted(i for p in lp2.pairs for i in p) == list(range(2 * k))
    # 기수 차를 없애면(cohort_cost 0) 후보 안에서 분야로만 골라 분야 0 후보를 아래에서 데려온다
    lp2b = seating.pick_leads(F2, cohort, k, cohort_cost=0)
    assert all(field2[a] == field2[b] for a, b in lp2b.pairs) and lp2b.beyond >= 1 and lp2b.skipped >= 1
    # 이미 만난 둘(0 · 4)은 피한다. 만난 값 2 는 두 기수 차와 같아서, 같은 분야 · 같은 기수 대신할 사람(8번을 5기로)이 있을 때
    forbid = np.zeros((n, n), bool); forbid[0, 4] = forbid[4, 0] = True
    cohort3 = cohort.copy(); cohort3[8] = cohort3[4]
    lp3 = seating.pick_leads(F, cohort3, k, forbid=forbid)
    assert lp3.met == 0 and not any({a, b} == {0, 4} for a, b in lp3.pairs)
    # 경계 기수가 같은 사람은 모두 후보, 후보가 모자라면 앞 테이블만
    tie = np.where(np.arange(n) < 6, np.arange(n) + 1, 7); tie[-1] = -1
    assert len(seating.pick_leads(F, tie, k).pool) == n - 1
    few = np.full(n, -1); few[:5] = 3
    lp4 = seating.pick_leads(F, few, k)
    assert len(lp4.pairs) == 2 and seating.pick_leads(F, np.full(n, -1), k).pairs == []


ROSTER_COHORTS = [5] * 2 + [6] * 2 + [7] * 3 + [8] * 3 + [9] * 9 + [10] * 6   # 실제 명단의 10기까지 참석자 25명


def test_pick_leads_seniority_first_real_roster():
    """기수 우선(10/25 민찬 결정): 실제 명단 분포(5~9기 19명 + 10기 6명, 10테이블 = 20명)면 분야 벡터가 무엇이든 5~8기는 모두 뽑히고 10기는 조금만."""
    k, n = 10, 70
    tens = []
    for seed in range(30):
        rng = np.random.default_rng(seed)
        cohort = np.full(n, -1)
        cohort[:25] = ROSTER_COHORTS
        cohort[25:60] = rng.integers(11, 20, 35)
        F = unit(rng.normal(size=(n, 16))); F = F @ F.T
        lp = seating.pick_leads(F, cohort, k)
        used = {i for p in lp.pairs for i in p}
        assert len(lp.pairs) == k and len(used) == 2 * k and max(cohort[i] for i in used) == 10
        assert all(i in used for i in range(25) if cohort[i] <= 8), seed       # 5~8기는 늘
        tens.append(sum(1 for i in used if cohort[i] == 10))
    assert min(tens) >= 1 and max(tens) <= 3 and np.mean(tens) < 2, tens      # 9기는 19명뿐이라 10기 1명은 꼭, 그 이상은 드물게


def test_pick_leads_lower_cohort_only_for_clear_field_fit():
    """10기가 9기를 대신하는 건 분야가 뚜렷이 더 맞을 때만: 9기 한 명(18번)만 혼자 다른 분야이고 10기 둘(19 · 20번)이 같은 분야면 18번 대신 10기 둘."""
    k, DIMS = 10, 16
    field = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 10, 9, 9, 11, 12, 13, 14]   # 0~9 = 5~8기, 10~18 = 9기, 19~24 = 10기
    rng = np.random.default_rng(5)
    F = unit(np.eye(DIMS)[field] + 0.05 * rng.normal(size=(25, DIMS))); F = F @ F.T
    cohort = np.array(ROSTER_COHORTS)
    lp = seating.pick_leads(F, cohort, k)
    used = {i for p in lp.pairs for i in p}
    assert used == (set(range(18)) | {19, 20}) and all(field[a] == field[b] for a, b in lp.pairs)
    assert lp.skipped == 1                                                       # 빠진 윗기수 = 18번(9기)
    # 같은 분야 10기가 한 명뿐이면(20번을 다른 분야로) 18번(9기)을 빼지 않는다
    field2 = list(field); field2[20] = 15
    F2 = unit(np.eye(DIMS)[field2] + 0.05 * rng.normal(size=(25, DIMS))); F2 = F2 @ F2.T
    used2 = {i for p in seating.pick_leads(F2, cohort, k).pairs for i in p}
    assert set(range(19)) <= used2 and sum(1 for i in used2 if cohort[i] == 10) == 1


def test_pick_leads_excludes_late():
    """지연 체크인한 사람(늦게 오는 사람)은 기수가 가장 높아도 주도 선배로 뽑지 않는다(구현하며 정함)."""
    rng = np.random.default_rng(3)
    k, n = 3, 20
    F = unit(rng.normal(size=(n, 8))); F = F @ F.T
    cohort = np.arange(n) + 1
    late = np.zeros(n, bool); late[[0, 2]] = True                 # 1기 · 3기가 늦게 온다
    lp = seating.pick_leads(F, cohort, k, exclude=late)
    used = {i for p in lp.pairs for i in p}
    assert len(lp.pairs) == k and not used & {0, 2} and 0 not in lp.pool and 2 not in lp.pool
    assert 0 in {i for p in seating.pick_leads(F, cohort, k).pairs for i in p}   # 빼지 않으면 1기는 뽑힌다


def test_seat_order_fixed_leads():
    """커피챗 좌석: 주도 선배 두 자리를 정하고 나머지는 모든 순서를 다 본 것과 같은 답. facing 은 i · i + size // 2(8명이면 좌석 1 · 5번)."""
    import itertools
    rng = np.random.default_rng(7)
    for k in (4, 7, 8, 10):
        M = rng.normal(size=(12, 12)); A = (M + M.T) / 2
        mem = [int(x) for x in rng.choice(12, k, replace=False)]
        a, b = mem[2], mem[-1]                                    # 주도 선배(맨 앞이 아니어도 된다)
        fx = seating.lead_fixed((a, b), k, "facing")
        order, total = seating.seat_order(A, mem, fixed=fx)
        assert sorted(order) == sorted(mem) and order[0] == a and order[k // 2] == b
        if k == 8:
            assert (order.index(a) + 1, order.index(b) + 1) == (1, 5)
        rest = [x for x in mem if x not in (a, b)]
        ring = lambda p: sum(A[p[i], p[(i + 1) % k]] for i in range(k))
        best = -np.inf
        for q in itertools.permutations(rest):
            it = iter(q)
            best = max(best, ring([a if s == 0 else b if s == k // 2 else next(it) for s in range(k)]))
        assert abs(total - best) < 1e-9 and abs(ring(order) - total) < 1e-9, (k, total, best)
        adj, _ = seating.seat_order(A, mem, fixed=seating.lead_fixed((a, b), k, "adjacent"))
        assert adj[0] == a and adj[1] == b
        free, t_free = seating.seat_order(A, mem, fixed=seating.lead_fixed((a, b), k, "free"))
        assert free[0] == a and abs(t_free - seating.seat_order(A, [a] + [x for x in mem if x != a])[1]) < 1e-9
    M = rng.normal(size=(20, 20)); A = (M + M.T) / 2               # 16명 넘으면 근사지만 고정 자리는 지킨다
    order, _ = seating.seat_order(A, list(range(20)), fixed=seating.lead_fixed((5, 9), 20, "facing"))
    assert sorted(order) == list(range(20)) and order[0] == 5 and order[10] == 9


def test_seat_order_large_table_falls_back():
    rng = np.random.default_rng(2)
    M = rng.normal(size=(20, 20)); A = (M + M.T) / 2
    order, total = seating.seat_order(A, list(range(20)))             # 20명은 근사. 순서가 온전하고 합이 맞는지만
    assert sorted(order) == list(range(20)) and abs(total - sum(A[order[i], order[(i + 1) % 20]] for i in range(20))) < 1e-9


def test_seat_order_is_exact():
    """좌석 순서(B-03)가 모든 순서를 다 본 것과 같은 답인지. 7 · 9명."""
    import itertools
    rng = np.random.default_rng(5)
    for k in (2, 3, 7, 9):
        M = rng.normal(size=(12, 12))
        A = (M + M.T) / 2
        mem = [int(x) for x in rng.choice(12, k, replace=False)]
        order, total = seating.seat_order(A, mem)
        assert sorted(order) == sorted(mem) and order[0] == mem[0]
        ring = lambda p: (sum(A[p[i], p[(i + 1) % len(p)]] for i in range(len(p))) if len(p) > 2
                          else A[p[0], p[1]] if len(p) == 2 else 0.0)        # 두 명이면 이웃은 한 쌍
        best = max(ring([mem[0]] + list(q)) for q in itertools.permutations(mem[1:]))
        assert abs(total - best) < 1e-9 and abs(ring(order) - total) < 1e-9, (k, total, best)


def test_seating_constraints_and_speed():
    O, S, is_host, cohort, _ = fake_people()
    A = scoring.table_matrix(scoring.directional(S, O), is_host)
    t0 = time.time()
    r = seating.assign(A, is_host, cohort, iters=20000, seed=1)
    sec = time.time() - t0
    sizes = np.bincount(r.table)
    assert sorted(sizes.tolist()) == sorted(seating.table_sizes(N))
    hosts = np.bincount(r.table[is_host], minlength=len(sizes))
    assert hosts.max() - hosts.min() <= 1                      # 호스트가 테이블마다 고르게
    assert r.cohort_over == 0
    greedy = seating.assign(A, is_host, cohort, iters=0, seed=1)
    assert r.objective >= greedy.objective                     # 담금질이 한 명씩 배정보다 나빠지지 않는다
    assert sec < 10, f"배정 {sec:.1f}초"                         # 성하 원본 38초
    print(f"  배정 {sec:.2f}초 · 반복 {r.iters} · 목적 {greedy.objective:.3f} → {r.objective:.3f}")


def test_second_round_forbids_repeats():
    O, S, is_host, cohort, _ = fake_people()
    A = scoring.table_matrix(scoring.directional(S, O), is_host)
    r1 = seating.assign(A, is_host, cohort, iters=5000, seed=1)
    forbid = seating.same_table_pairs(r1.table)
    r2 = seating.assign(A, is_host, cohort, forbid=forbid, iters=20000, seed=2)
    assert r2.forbid_hits == 0, f"재회 {r2.forbid_hits}쌍"


def test_random_seats_stay():
    O, S, is_host, cohort, _ = fake_people()
    A = scoring.table_matrix(scoring.directional(S, O), is_host)
    r = seating.assign(A, is_host, cohort, random_ratio=0.15, iters=0, seed=3)
    frac = r.random_seat[~is_host].mean()
    assert 0.03 < frac < 0.35, frac                            # 학생의 약 15%
    r2 = seating.assign(A, is_host, cohort, random_ratio=0.15, iters=20000, seed=3)
    assert np.array_equal(r2.table[r2.random_seat], r.table[r.random_seat])   # 무작위 자리는 담금질이 안 옮긴다


def test_codebook_frozen_assign():
    O, S, *_ = fake_people()
    cb = codebook.fit(O[:60], S[:60], "cb-test", K=8, L=3, n_init=3)
    co = cb.address(O, "offer")
    assert co.shape == (N, 3) and co.max() < 8
    late = cb.address(O[60:], "offer")                         # 늦게 온 사람은 고정 코드북에 붙이기만
    assert np.array_equal(late, co[60:])
    d = codebook.disambiguate(co)
    assert len({(tuple(c), x) for c, x in zip(co, d)}) == N    # 주소 + 구분 번호는 모두 다름


def test_codebook_no_seek():
    O, *_ = fake_people()
    cb = codebook.fit(O, O[:0], "cb-noseek", K=8, L=3, n_init=3)     # 찾는 사람을 아무도 안 쓴 명단(10/18 폼)
    assert np.isfinite(cb.mu_seek).all() and np.allclose(cb.mu_seek, cb.mu_offer)
    assert np.array_equal(cb.address(O, "seek"), cb.address(O, "offer"))


def test_card_shift():
    O, S, *_ = fake_people()
    W = np.zeros((N, N))
    Z = scoring.card_shift(S, O, W)
    assert np.allclose(Z, unit(S))                             # 간선이 없으면 그대로
    W[10, 20] = W[20, 10] = 0.3
    Z = scoring.card_shift(S, O, W, beta=0.5)
    assert Z[10] @ unit(O)[20] > unit(S)[10] @ unit(O)[20]     # 내 Seek 가 명함 상대의 Offer 쪽으로 움직인다
    assert Z[20] @ unit(O)[10] > unit(S)[20] @ unit(O)[10]     # 상대도 마찬가지(무방향)
    assert np.allclose(Z[11], unit(S)[11])


def test_recs():
    O, S, is_host, cohort, tags = fake_people()
    a = scoring.directional(S, O)
    r1 = seating.assign(scoring.table_matrix(a, is_host), is_host, cohort, iters=3000, seed=1)
    met = seating.same_table_pairs(r1.table)
    np.fill_diagonal(met, True)
    lists, exposure = recs.personal(a, met, n_exact=10, n_explore=2, seed=0)
    for i, lst in enumerate(lists):
        js = [j for j, _ in lst]
        assert len(js) == len(set(js)) == 12
        assert not met[i, js].any()                            # 이미 만난 사람은 없음
        assert [k for _, k in lst].count("explore") == 2
    assert exposure.max() <= 15
    prompts = recs.talk_prompts(list(np.where(r1.table == 0)[0]), tags)
    assert prompts


def test_incremental_state_matches_full_recount():
    """증분 계산이 매번 전부 다시 센 값과 같은지 — 빠르게 만든 부분의 정확성 확인."""
    import random as _r
    O, S, is_host, cohort, _ = fake_people()
    A = scoring.table_matrix(scoring.directional(S, O), is_host)
    r1 = seating.assign(A, is_host, cohort, iters=0, seed=1)
    forbid = seating.same_table_pairs(r1.table)
    k = r1.table.max() + 1
    rng = _r.Random(0)
    t = np.array(rng.sample(list(r1.table), N))
    st = seating._State(A, forbid, cohort, t, k)
    for _ in range(3000):
        i, j = rng.randrange(N), rng.randrange(N)
        if st.t[i] != st.t[j]:
            st.swap(i, j)
    fresh = seating._State(A, forbid, cohort, st.t, k)
    assert np.allclose(st.ssum, fresh.ssum)
    assert st.forbid_hits == fresh.forbid_hits and st.cohort_over == fresh.cohort_over



def test_seek_shift():
    """만족도 답에 따라 Seek 가 그 테이블 사람들 쪽으로 옮겨지는 폭이 다른가."""
    rng = np.random.default_rng(3)
    O = rng.normal(size=(8, 16)); S = rng.normal(size=(8, 16))
    mates = [[1, 2], [0, 2], [0, 1], [4], [3], [], [], []]
    w = np.array([1.0, 0.3, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0])
    Z = scoring.seek_shift(S, scoring.unit(O), mates, w, beta=0.5)
    Su, Ou = scoring.unit(S), scoring.unit(O)
    toward = lambda i: float(Z[i] @ Ou[mates[i]].mean(0) - Su[i] @ Ou[mates[i]].mean(0))
    assert toward(0) > toward(1) > 0                            # 얻었다(1.0) 가 조금 달랐다(0.3) 보다 많이 옮김
    assert np.allclose(Z[2], Su[2]) and np.allclose(Z[4], Su[4])  # 가중치 0 은 그대로
    assert np.allclose(Z[5], Su[5])                              # 동석자가 없으면 그대로
    w2 = scoring.sat_weights("gained=0.8, mismatch=0.1")
    assert w2 == {"gained": 0.8, "different": 0.33, "unsure": 0.0, "mismatch": 0.1}
    assert scoring.sat_weights("") == {"gained": 1.0, "different": 0.33, "unsure": 0.0, "mismatch": -0.2}  # C안 기본값
    Zn = scoring.seek_shift(S, scoring.unit(O), mates, np.array([-0.2, 0, 0, 0, 0, 0, 0, 0]), beta=0.5)
    assert float(Zn[0] @ Ou[mates[0]].mean(0) - Su[0] @ Ou[mates[0]].mean(0)) < 0          # 안 맞았다는 반대로 밀어냄


def test_poster_targets():
    """관심 포스터 답 → 목표 벡터(가중 평균)와 옮기는 폭(가장 큰 가중치)."""
    e1, e2 = np.eye(4)[0], np.eye(4)[1]
    rows = [(0, 1, 1.0), (0, 2, 0.5), (1, 2, 0.0), (2, 1, -0.2)]  # 0 번: 알아보고 싶다 + 흥미로웠다, 1 번: 0, 2 번: 관심 분야 아님
    T, w = scoring.poster_targets(3, rows, {1: e1, 2: e2}, 4)
    assert np.allclose(T[0], (e1 + 0.5 * e2) / 1.5) and w[0] == 1.0
    assert not T[1].any() and w[1] == 0 and w[2] == 0                # 당김 쪽에는 음수 답이 안 들어감
    Tn, wn = scoring.poster_targets(3, rows, {1: e1, 2: e2}, 4, negative=True)
    assert np.allclose(Tn[2], e1) and wn[2] == -0.2 and wn[0] == 0 and wn[1] == 0
    S = scoring.unit(np.array([[0, 0, 1.0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]]))
    Z = scoring.seek_toward(S, T, w, beta=0.5)
    assert Z[0] @ e1 > 0 and np.allclose(Z[1], S[1]) and np.allclose(Z[2], S[2])
    Zn = scoring.seek_toward(S, Tn, wn, beta=0.5)
    assert Zn[2] @ e1 < 0 and np.allclose(Zn[0], S[0])                # 관심 분야 아님은 그 주제에서 밀어냄
    assert scoring.poster_weights("interesting=0.2") == {"learn_more": 1.0, "interesting": 0.2, "not_mine": -0.2}
    assert scoring.poster_weights("") == {"learn_more": 1.0, "interesting": 0.33, "not_mine": -0.2}  # 9/29 기본값


def test_gives_matrix_and_rec_rule_score():
    """'줄 수 있는 것' 규칙(10/18, 사전 등록 폼 선택지): 고른 기대하는 점(규칙 있는 것만)마다 상대가 줄 수 있는 정도의 평균. 한 방향."""
    intents = [["커리어 조언·현업 이야기", "취업·이직 정보", "스터디·프로젝트 팀원 찾기", "비슷한 분야 사람 만나기"], [], [], ["대학원 진학·연구"]]
    careers = ["student", "employed", None, "grad"]
    g = scoring.gives_matrix(intents, careers)
    assert np.isclose(g[0, 1], 2 / 3) and np.isclose(g[0, 3], 0.0)       # 학생 → 재직자: 커리어 · 취업(규칙 없는 '비슷한 분야'는 안 셈)
    assert g[1].sum() == 0 and g[2].sum() == 0 and g[:, 2].sum() == 0     # 원하는 것 없음 · 구분 모름 → 0
    assert np.isclose(g[0, 0], 0.0) and np.isclose(g[3, 3], 0.0)          # 자기 자신은 0
    g2 = scoring.gives_matrix([["취업 ㆍ 이직 정보(현업)", "기타: 네트워킹"], []], [None, "employed"])
    assert np.isclose(g2[0, 1], 1.0)                                      # 괄호 설명 · 띄어쓰기 무시, 규칙 없는 '기타'는 안 셈
    assert scoring.intent_unknown([["취업·이직 정보", "비슷한 분야 사람 만나기", "기타: 네트워킹"]]) == ["기타: 네트워킹"]
    g3 = scoring.gives_matrix([["대학원 진학·연구"], [], [], [], []], [None, "grad", "lab_intern", "student", "professor"])
    assert np.allclose(g3[0, 1:], [1.0, 0.5, 0.0, 1.0])                  # 대학원생 · 교수 > 학부연구생(연구실 인턴) > 학생
    g4 = scoring.gives_matrix([["창업·사이드 프로젝트"], ["창업·사이드 프로젝트"], []], ["student", "student", "employed"])
    assert g4[0, 1] == 0.5 and g4[0, 2] == 0.0                           # 창업 · 사이드: 같은 선택지를 고른 사람 0.5(창업자보다 한 단계 낮게)
    g4b = scoring.gives_matrix([["창업·사이드 프로젝트"], []], ["student", ["employed", "founder"]])
    assert g4b[0, 1] == 1.0                                               # 창업자(외부연사 CEO)는 같은 선택지를 안 골라도 1
    g5 = scoring.gives_matrix([["최신 AI·데이터 트렌드"], [], [], []], [None, "employed", "grad", "student"])
    assert np.allclose(g5[0, 1:], [0.5, 0.5, 0.0])
    g6 = scoring.gives_matrix([["취업·이직 정보", "대학원 진학·연구"], [], [], []],
                              [None, ["student", "intern", "lab_intern"], ["employed", "grad"], []])
    assert np.allclose(g6[0, 1:], [0.5, 1.0, 0.0])                      # 구분 여러 개(0017): 선택지마다 가장 높은 값. 인턴 0.5 · 학부연구생 0.5, 빈 목록 = 모름
    rng = np.random.default_rng(0)
    n, d = 12, 16
    O = scoring.unit(rng.normal(size=(n, d)) + 3)                         # 공통 방향이 큰 벡터(평균 빼기가 필요한 상황)
    S = scoring.unit(rng.normal(size=(n, d)) + 3)
    intents = [["취업·이직 정보"]] * n
    careers = ["employed" if j % 3 == 0 else "student" for j in range(n)]
    R = scoring.rec_rule_score(S, O, intents, careers)
    assert R.shape == (n, n) and np.allclose(np.diag(R), 0)
    for i in range(n):                                                    # 취업 · 이직 정보를 원하면 재직자가 평균적으로 위
        emp = [R[i, j] for j in range(n) if j != i and careers[j] == "employed"]
        stu = [R[i, j] for j in range(n) if j != i and careers[j] == "student"]
        assert np.mean(emp) > np.mean(stu)
    R0 = scoring.rec_rule_score(S, O, intents, [None] * n)                # 구분을 아무도 모르면 규칙 부분은 0
    assert np.isfinite(R0).all()

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
