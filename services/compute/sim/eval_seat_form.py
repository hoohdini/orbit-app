"""좌석(테이블토크 + 커피챗) 비교 평가를 사전 등록 폼 모양 답으로(10/19 민찬). 10/18 스크래치 실험(좌석 1.73 → 2.12, 규칙 2.07,
DSL 활동 2.55 → 2.27, 어려운 필요 98%)을 저장소에서 다시 돌릴 수 있게 옮긴 것.

사람 · 배치 · 아는 사이 = sim/make_seat_eval_dataset.make(seed), 폼 답 = sim/eval_recs_rule.form(같은 하는 일 · 분야 · 기대하는 점 · 구분, --seek 도 같음)
배정 = 서비스와 같은 순서: 테이블토크(9개 테이블, 같은 기수 3명 상한) → 커피챗(3~4명, 테이블토크 동석자 금지)
비교
  무작위(--random 번 평균), 예전(0/0) = pair_directional(평균 빼기 X, 분야 0), 배정용 보정(1/0.5) = 지금 좌석 기본(#44),
  보정 + 규칙 = scoring.rec_rule_score(추천 10명과 같은 1 : 1 : 2), 보정 + DSL 활동 = 하는 일에 'DSL 활동: …' 줄을 더함(재학 · 수료 · 운영진)
지표
  좋은 만남 = 행사(테이블토크 + 커피챗)에서 만난 사람 중 좋은 상대(eval_seating.truth: 필요를 채우고 분야가 겹치고 처음 보는 사이) 수, 1인 평균. 0명 비율
  어려운 필요 = 취업정보 · 이직정보 · 멘토링 · 대학원진학 · 채용 · 연구협업 · 창업(학생끼리 잘 못 채우는 것)이 있는 사람 중
               그걸 줄 사람(숨은 정답)을 한 명이라도 만난 비율

실행  python sim/eval_seat_form.py --seeds 2026-2045 [--seek interest] [--random 100]      (모델 필요)
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
from eval_recs_rule import form  # noqa: E402
from make_seat_eval_dataset import make  # noqa: E402
from pipeline import scoring, seating  # noqa: E402
from pipeline.embed import Encoder, offer_items, seek_items  # noqa: E402
from pipeline.people import acquainted  # noqa: E402
from service import COFFEECHAT_COHORT_CAP, COFFEECHAT_GROUP_MAX, TABLETALK_COHORT_CAP  # noqa: E402

HARD = {"취업정보", "이직정보", "멘토링", "대학원진학", "채용", "연구협업", "창업"}
DSL_ACT = ["모델링", "EDA", "도메인", "논문 리딩", "공모전"]


def measure(tt, cc, P, good, pop, n) -> tuple[float, float, float]:
    met = ev.mates(tt, n) | ev.mates(cc, n)
    tot = np.array([int((good[i] & met[i]).sum()) for i in pop])
    hard = [i for i in pop if HARD & set(P[i]["goals"])]
    ok = [any(met[i, j] and any(ev.satisfies(g, P[j]) for g in HARD & set(P[i]["goals"])) for j in range(n)) for i in hard]
    return float(tot.mean()), float((tot == 0).mean()), float(np.mean(ok)) if ok else float("nan")


def run(seed: int, enc, seek: str, n_random: int) -> dict:
    P = form(make(seed), seed, 0.0, seek)
    n = len(P)
    know = acquainted([dict(cohort=p["cohort"], affiliation=p["affiliation"], teams=p["teams"]) for p in P])
    good = ev.truth(P, know)["good"]
    is_host = np.array([p["host"] for p in P])
    tt_pop = [i for i, p in enumerate(P) if p["tabletalk"]]
    cc_pop = [i for i, p in enumerate(P) if p["coffeechat"]]
    tt_sizes, cc_sizes = seating.even_sizes(len(tt_pop), 9), seating.group_sizes(len(cc_pop), COFFEECHAT_GROUP_MAX)

    out = {}
    rs = []
    for r in range(n_random):
        rng = random.Random(seed * 10000 + r)
        tt = ev.random_groups(tt_pop, tt_sizes, rng)
        rs.append(measure(tt, ev.random_groups(cc_pop, cc_sizes, rng, ev.mates(tt, n)), P, good, tt_pop, n))
    out["무작위"] = tuple(np.mean(rs, axis=0))

    rd = random.Random(seed * 7 + 9)
    dsl = [p["f_offer"] + ("\nDSL 활동: " + ", ".join(rd.sample(DSL_ACT, rd.choice([1, 2]))) if p["group"] in ("active", "alumni", "staff") else "")
           for p in P]
    O, _ = enc.people([offer_items(p["f_offer"], p["topic_tags"]) for p in P])
    Od, _ = enc.people([offer_items(x, p["topic_tags"]) for x, p in zip(dsl, P)])
    S, blank = enc.people([seek_items(p["f_seek"], p["intent_tags"]) for p in P])
    Sd = scoring.fill_blank_seek(S, Od, blank)
    S = scoring.fill_blank_seek(S, O, blank)
    methods = {
        "예전(0/0)": scoring.pair_directional(S, O, False, 0.0),
        "배정용 보정(1/0.5)": scoring.pair_directional(S, O, True, 0.5),
        "보정 + 규칙(1:1:2)": scoring.rec_rule_score(S, O, [p["intent_tags"] for p in P], [p["career"] for p in P]),
        "보정 + DSL 활동": scoring.pair_directional(Sd, Od, True, 0.5),
    }
    for name, M in methods.items():
        A = scoring.table_matrix(M, is_host, "min")
        tt = ev.anneal(A, tt_pop, P, tt_sizes, TABLETALK_COHORT_CAP, seed=42)
        cc = ev.anneal(A, cc_pop, P, cc_sizes, COFFEECHAT_COHORT_CAP, seed=43, forbid=ev.mates(tt, n), penalty=None)
        out[name] = measure(tt, cc, P, good, tt_pop, n)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="2026-2045")
    ap.add_argument("--seek", choices=("blank", "interest"), default="blank", help="찾는 사람 문장: blank = 폼처럼 빈칸(기본), interest = 숨은 관심 도메인")
    ap.add_argument("--random", type=int, default=100, help="무작위 배정 횟수(시드마다)")
    a = ap.parse_args()
    lo, hi = (int(x) for x in a.seeds.split("-")) if "-" in a.seeds else (int(a.seeds), int(a.seeds))
    enc, rs = Encoder(), []
    for s in range(lo, hi + 1):
        rs.append(run(s, enc, a.seek, a.random))
    print(f"시드 {lo}~{hi} · 찾는 사람 {a.seek} · 행사 중 좋은 만남(1인 평균) · 0명 비율 · 어려운 필요를 줄 사람을 만난 비율")
    base = np.array([r["배정용 보정(1/0.5)"][0] for r in rs])
    for k in rs[0]:
        v = np.array([r[k] for r in rs])
        win = f" · 보정보다 나은 시드 {int((v[:, 0] > base).sum())}/{len(rs)}" if k != "배정용 보정(1/0.5)" else ""
        print(f"  {k:18s} {v[:, 0].mean():.2f} ±{v[:, 0].std():.2f} · {v[:, 1].mean():.0%} · {v[:, 2].mean():.0%}{win}")


if __name__ == "__main__":
    main()
