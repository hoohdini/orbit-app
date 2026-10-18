"""추천 10명 비교 평가(10/18 민찬). 서비스 추천 함수 그대로(pipeline/recs.personal: 정확 8 + 탐색 2, 한 사람 최대 12개 목록,
이미 아는 사이 뒤로, 전날 테이블토크 동석자 제외)로 점수 방식만 바꿔 '좋은 상대'가 10명 중 몇 명인지 센다.

사람 · 배치 · 아는 사이 = sim/make_seat_eval_dataset.make(seed) 그대로. 폼 답만 10/17 구글폼 모양으로 바꾼다(자유 문장 없음)
  하는 일 = 직책(+ 소속 70%), 분야 태그 = 재직자 · 교수는 직무 도메인, 학생 · 대학원생은 관심 도메인(학생은 직무 도메인을 안 고름)
  찾는 사람 = '관심 분야: <관심 도메인>', 기대하는 점(관계태그) = 숨은 원하는 것 그대로, 구분(career) = 단계에서(재직 · 대학원 · 재학 · 교수)
숨은 관심 도메인: 60% 는 자기 분야 포함, 40% 는 다른 분야 포함(1~3개)
좋은 상대
  T1 = 상대가 내 필요를 채움(need > 0) 그리고 분야가 겹침, 처음 보는 사이(sim/eval_seating.py 정답 그대로)
  T2 = 같은데 분야 대신 '상대 주 분야가 내 관심 도메인 안'
비교: 예전(찾는 사람 → 하는 일 cos, min · one_way), 배정용 보정 점수(seat_directional 과 같은 계산), rule(scoring.rec_rule_score)
--noise p: 숨은 정답의 '줄 수 있는 것'을 사람마다 흔든다(항목마다 p 확률로 빼고, p 확률로 표에 없는 것 하나 더함, 1 이면 완전 무작위).
           규칙표(scoring.GIVES)가 실제와 어긋날 때 이득이 얼마나 남는지 본다

실행  python sim/eval_recs_rule.py --seeds 2026-2045 [--noise 0.4]      (약 2분, 모델 필요)
"""
from __future__ import annotations

import argparse
import os
import random
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import eval_seating as ev  # noqa: E402
from make_seat_eval_dataset import DOMAINS, GOALS, JOB, make  # noqa: E402
from pipeline import recs as recm  # noqa: E402
from pipeline import scoring, seating  # noqa: E402
from pipeline.embed import Encoder, offer_items, seek_items  # noqa: E402
from pipeline.people import acquainted  # noqa: E402
from service import TABLETALK_COHORT_CAP  # noqa: E402

DOM = list(DOMAINS)
EMPLOYED = ("주니어", "시니어", "창업자")


def career(stage: str) -> str:
    return "employed" if stage in EMPLOYED else "grad" if stage == "대학원생" else "professor" if stage == "교수" else "student"


def title(rng, p) -> str:
    s = p["stage"]
    if s.startswith("학부"):
        return rng.choice(["학부생", "학부 재학생"])
    if s == "대학원생":
        return rng.choice(["석사과정", "석사과정", "박사과정"])
    return rng.choice(JOB[s]) if s in JOB else {"창업자": "대표", "교수": "교수"}[s]


def form(P: list[dict], seed: int, noise: float) -> list[dict]:
    hw, rng, nz = random.Random(seed * 7 + 1), random.Random(seed * 7 + 5), random.Random(seed * 31 + int(noise * 100))
    order = lambda xs: sorted(set(xs), key=DOM.index)
    for p in P:
        d1, d2 = p["domains"]
        own, w = hw.random() < 0.6, []
        if own:
            w += [d1] + ([d2] if hw.random() < 0.4 else [])
        if not own or hw.random() < 0.4:
            w += hw.sample([d for d in DOM if d not in (d1, d2)], hw.choice([1, 1, 2]))
        p["wanted"] = w[:3]
    for p in P:
        d1, d2 = p["domains"]
        p["career"] = career(p["stage"])
        job = [d1] + ([d2] if rng.random() < 0.7 else []) if p["career"] in ("employed", "professor") else []
        p["topic_tags"] = order(job) or order(p["wanted"])
        p["f_offer"] = title(rng, p) + (f" · {p['affiliation']}" if rng.random() < 0.7 else "")
        p["f_seek"] = "관심 분야: " + ", ".join(order(p["wanted"]))
        p["intent_tags"] = [g for g in GOALS if g in p["goals"]]
        if noise >= 1.0:
            p["gives"] = nz.sample(GOALS, nz.randint(2, 4))
        elif noise > 0:
            g = [x for x in p["gives"] if nz.random() >= noise]
            if nz.random() < noise:
                g.append(nz.choice([x for x in GOALS if x not in g]))
            p["gives"] = g
    return P


def truth2(P, know):
    n = len(P)
    need, dom = np.zeros((n, n)), np.zeros((n, n))
    for i, p in enumerate(P):
        W = set(p["wanted"])
        for j, q in enumerate(P):
            if i != j:
                need[i, j] = sum(ev.satisfies(g, q) for g in p["goals"]) / len(p["goals"])
                dom[i, j] = 1.0 if q["domains"][0] in W else 0.6 if W & set(q["domains"]) else 0.0
    return dict(good=(need > 0) & (dom > 0) & ~know)


def service_lists(M: np.ndarray, P, met: np.ndarray) -> np.ndarray:
    """service._write_recs 와 같은 절차(아는 사이 감점 폭도 같게)."""
    s = M.copy()
    same = acquainted(P)
    s[same] -= max(1.0, float(np.ptp(s)))
    lists, _ = recm.personal(s, met, seed=42, avoid=same)
    return lists


def run(seed: int, enc, noise: float) -> dict:
    P = form(make(seed), seed, noise)
    n = len(P)
    know = acquainted([dict(cohort=p["cohort"], affiliation=p["affiliation"], teams=p["teams"]) for p in P])
    T = {"T1": ev.truth(P, know)["good"], "T2": truth2(P, know)["good"]}
    O, _ = enc.people([offer_items(p["f_offer"], p["topic_tags"]) for p in P])
    S, blank = enc.people([seek_items(p["f_seek"], p["intent_tags"]) for p in P])
    S = scoring.fill_blank_seek(S, O, blank)
    # 전날 테이블토크(서비스와 같이 배정용 보정 점수로)를 앉히고 동석자는 추천에서 뺀다
    is_host = np.array([p["host"] for p in P])
    pop = [i for i, p in enumerate(P) if p["tabletalk"]]
    A = scoring.table_matrix(scoring.pair_directional(S, O, True, 0.5), is_host, "min")
    tt = ev.anneal(A, pop, P, seating.even_sizes(len(pop), 9), TABLETALK_COHORT_CAP, seed=42)
    met = ev.mates(tt, n)
    np.fill_diagonal(met, True)
    a = scoring.directional(S, O)
    seat = scoring.pair_directional(S, O, True, 0.5)
    methods = {
        "예전 min(지금 기본)": scoring.combine(a, "min"),
        "예전 one_way": a,
        "배정용 보정 점수 min": scoring.combine(seat, "min"),
        "배정용 보정 점수 one_way": seat,
        "rule(새 기본)": scoring.rec_rule_score(S, O, [p["intent_tags"] for p in P], [p["career"] for p in P]),
    }
    out = {}
    for name, M in methods.items():
        lists = service_lists(M, P, met)
        for t, G in T.items():
            g = np.array([sum(G[i, j] for j, _ in lists[i]) for i in range(n)])
            out[(t, name)] = (g.mean(), (g == 0).mean())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="2026-2045")
    ap.add_argument("--noise", type=float, default=0.0)
    a = ap.parse_args()
    lo, hi = (int(x) for x in a.seeds.split("-")) if "-" in a.seeds else (int(a.seeds), int(a.seeds))
    enc, rs = Encoder(), []
    for s in range(lo, hi + 1):
        rs.append(run(s, enc, a.noise))
    print(f"시드 {lo}~{hi} · 정답 흔듦 {a.noise} · 추천 10명 중 좋은 상대 수(평균) · 좋은 상대 0명 비율")
    for t in ("T1", "T2"):
        print(f"== {t}")
        for k in rs[0]:
            if k[0] == t:
                v = np.array([r[k] for r in rs])
                print(f"  {k[1]:22s} {v[:, 0].mean():.2f} ±{v[:, 0].std():.2f} · {v[:, 1].mean():.0%}")


if __name__ == "__main__":
    main()
