"""가상 70명으로 계산 한 바퀴 — 실제 e5 모델을 쓰고 DB 는 쓰지 않는다.

전날 배치(임베딩 → 코드북 → 주소 → 테이블토크 배정) → 명함 교환(합성) → 만남 반영 → 커피챗 배정 → 개인 추천.
목적은 성능 측정이 아니라 끝까지 도는지 · 제약이 지켜지는지 · 걸리는 시간이다. 문장은 템플릿으로 만든 가상 인물이다.

실행  cd services/compute && python sim/run_sim.py
"""
from __future__ import annotations

import os
import random
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pipeline import codebook, recs, scoring, seating  # noqa: E402
from pipeline.embed import Encoder, offer_items, seek_items  # noqa: E402

FIELDS = ["추천시스템", "자연어처리", "컴퓨터비전", "시계열 예측", "금융 데이터", "마케팅 분석",
          "회계 감사", "HR 데이터", "바이오 통계", "데이터 엔지니어링", "강화학습", "인과추론"]
DOING = ["{f} 연구를 하고 있다", "{f} 인턴을 하고 있다", "{f} 프로젝트를 진행 중이다", "{f} 쪽으로 대학원을 준비한다",
         "회사에서 {f} 업무를 3년째 하고 있다"]
SEEK = ["{f} 현업자에게 커리어 조언을 듣고 싶다", "{f} 같이 공부할 동료를 찾는다", "{f} 대학원 진학 경험을 듣고 싶다",
        "{f} 프로젝트 팀원을 구한다", "{f} 분야 선배에게 포트폴리오 피드백을 받고 싶다"]


def people(n=70, n_host=10, seed=7):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        f, g = rng.choice(FIELDS), rng.choice(FIELDS)
        host = i < n_host
        out.append(dict(
            offer=f"{rng.choice(DOING).format(f=f)}\n{rng.choice(DOING).format(f=g)}",
            seek="" if host or rng.random() < 0.15 else rng.choice(SEEK).format(f=rng.choice([f, g, rng.choice(FIELDS)])),
            tags=[f, g] if f != g else [f], intents=[], host=host, cohort=None if host else rng.randint(10, 14)))
    return out


def main():
    P = people()
    n = len(P)
    t0 = time.time()
    enc = Encoder()
    t_load = time.time() - t0

    t = time.time()
    O, _ = enc.people([offer_items(p["offer"], p["tags"]) for p in P])
    S, blank = enc.people([seek_items(p["seek"], p["intents"]) for p in P])
    t_embed = time.time() - t
    S = scoring.fill_blank_seek(S, O, blank)

    t = time.time()
    cb = codebook.fit(O, S[~blank], version="cb-sim")
    co, cs = cb.address(O, "offer"), cb.address(S, "seek")
    t_cb = time.time() - t

    is_host = np.array([p["host"] for p in P])
    cohort = np.array([p["cohort"] if p["cohort"] is not None else -1 for p in P])
    a = scoring.directional(S, O)
    t = time.time()
    r1 = seating.assign(scoring.table_matrix(a, is_host, "min"), is_host, cohort, iters=20000, seed=1)
    t_r1 = time.time() - t

    rng = np.random.default_rng(3)                       # 명함 교환 (합성) — 같은 테이블 위주 + 가끔 다른 테이블
    W = np.zeros((n, n))
    same = seating.same_table_pairs(r1.table)
    for i in range(n):
        for j in np.where(same[i])[0]:
            if rng.random() < 0.7:
                W[i, j] = W[j, i] = 0.3
        if rng.random() < 0.4:
            j = int(rng.integers(n))
            if j != i:
                W[i, j] = W[j, i] = 0.3
    S2 = scoring.card_shift(S, O, W, beta=0.5)
    a2 = scoring.directional(S2, O)

    t = time.time()
    r2 = seating.assign(scoring.table_matrix(a2, is_host, "min"), is_host, cohort, forbid=same, iters=20000, seed=2)
    t_r2 = time.time() - t
    met = same | seating.same_table_pairs(r2.table) | (W > 0)
    np.fill_diagonal(met, True)
    lists, exposure = recs.personal(scoring.rec_matrix(a2), met, seed=0)

    print(f"가상 {n}명 (호스트 {is_host.sum()} · 빈 Seek {blank.sum()})")
    print(f"  모델 로드 {t_load:.1f}초 · 임베딩 {t_embed:.1f}초 · 코드북+주소 {t_cb:.2f}초")
    print(f"  주소 충돌 Offer {codebook.collision_rate(co):.0%} · Seek {codebook.collision_rate(cs):.0%}")
    print(f"  테이블토크 배정 {t_r1:.2f}초 · 테이블 {r1.table.max()+1}개 · 같은 기수 초과 {r1.cohort_over}")
    print(f"  커피챗 배정 {t_r2:.2f}초 · 테이블토크 동석자 재회 {r2.forbid_hits}쌍")
    print(f"  추천 인당 {len(lists[0])}칸 · 노출 최소 {exposure.min()} 최대 {exposure.max()} · 이미 만난 사람 포함 "
          f"{sum(met[i, [j for j, _ in l]].any() for i, l in enumerate(lists))}명")
    ok = r2.forbid_hits == 0 and r1.cohort_over == 0
    print("판정:", "통과" if ok else "제약 위반 있음")


if __name__ == "__main__":
    main()
