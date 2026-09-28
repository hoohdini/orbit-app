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
from pipeline.embed import split_items, offer_items, seek_items, unit  # noqa: E402

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


def test_inject():
    O, *_ = fake_people()
    W = np.zeros((N, N))
    Z = scoring.inject(O, W)
    assert np.allclose(Z, unit(O))                             # 간선이 없으면 그대로
    W[10, 20] = W[20, 10] = 1.0
    Z = scoring.inject(O, W, beta=0.5)
    assert Z[10] @ unit(O)[20] > unit(O)[10] @ unit(O)[20]     # 만난 사람 쪽으로 움직인다
    assert np.allclose(Z[11], unit(O)[11])


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

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
