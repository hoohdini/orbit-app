"""커피챗 10테이블 · 주도 선배 평가(10/22 민찬 결정). 가상 80명(sim/make_seat_eval_dataset.make)으로 서비스와 같은 순서를 돈다.

테이블토크 = 1번 고정(운영진 · 교수 · 연사) + 나머지 9테이블 → 커피챗 = 체크인 전원 80명을 10테이블에, 테이블마다 주도 선배 2명(seating.pick_leads)
비교 = 10테이블 주도 선배 없음(선배를 먼저 앉히는 비용), 예전 커피챗(3~4명 그룹, 같은 기수 3명째부터). 같은 사람 · 같은 점수(A) · 같은 금지 쌍(테이블토크 동석자)
지표
  쌍 점수 = 배정에 쓴 점수(A)로 본 내 테이블 사람과의 평균(1인 평균). 테이블이 커지면 덜 맞는 사람도 섞여 낮아지는 게 보통이다
  좋은 상대 = 숨은 정답(eval_seating.truth: 필요를 채우고 분야가 겹치고 처음 보는 사이)인 동석자 수(1인 평균)
  주도 선배 분야 일치 = 두 주도 선배의 숨은 첫 관심 분야가 같은 테이블 비율. 21위 아래 = 기수 순(동률은 사람 번호 순) 21번째보다 아래에서 뽑힌 수
만남 반영(만족도 · 명함 · 포스터)은 넣지 않았다. 문장 점수만으로 본 비교다

실행  python sim/eval_coffeechat_leads.py [--seeds 2026-2030]      (e5 모델 필요)
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import eval_seating as ev  # noqa: E402
from make_seat_eval_dataset import make  # noqa: E402
from pipeline import scoring, seating  # noqa: E402
from pipeline.embed import Encoder, offer_items, seek_items  # noqa: E402
from pipeline.people import acquainted  # noqa: E402
import service  # noqa: E402


def run(seed: int, enc, show: bool) -> dict:
    P = make(seed)
    n = len(P)
    O, _ = enc.people([offer_items(p["offer_text"], p["topic_tags"]) for p in P])
    S, blank = enc.people([seek_items(p["seek_text"], p["intent_tags"]) for p in P])
    S = scoring.fill_blank_seek(S, O, blank)
    is_host = np.array([p["host"] for p in P])
    cohort = np.array([p["cohort"] if p["cohort"] is not None else -1 for p in P])
    A = scoring.table_matrix(scoring.seat_directional(S, O), is_host)
    know = acquainted([dict(cohort=p["cohort"], affiliation=p["affiliation"], teams=p["teams"]) for p in P])
    good = ev.truth(P, know)["good"]

    fixed = [i for i, p in enumerate(P) if p["fixed_table"]]
    reg = [i for i in range(n) if i not in fixed]
    r = seating.assign(A[np.ix_(reg, reg)], is_host[reg], cohort[reg], iters=20000, seed=42, sizes=seating.even_sizes(len(reg), 9),
                       cohort_penalty=service.TABLETALK_COHORT_PENALTY, cohort_cap=service.TABLETALK_COHORT_CAP)
    tt = np.zeros(n, int)
    tt[reg] = r.table + 1
    forbid = seating.same_table_pairs(tt)

    def score(table, cap):
        mates = seating.same_table_pairs(table)
        pair = np.array([A[i, mates[i]].mean() for i in range(n)])
        return dict(pair=float(pair.mean()), good=float((good & mates).sum(1).mean()),
                    forbid=int((forbid & mates).sum() // 2), cohort_over=seating.cohort_overflow(table, cohort, cap=cap),
                    sizes=sorted(np.bincount(table).tolist(), reverse=True))

    sizes = seating.even_sizes(n, service.COFFEECHAT_TABLES)
    lp = seating.pick_leads(O @ O.T, cohort, len(sizes), forbid=forbid)
    anchors = {i: t for t, pr in enumerate(lp.pairs) for i in pr}
    new = seating.assign(A, is_host, cohort, forbid=forbid, iters=20000, seed=43, sizes=sizes, anchors=anchors,
                         cohort_penalty=service.COFFEECHAT_COHORT_PENALTY, cohort_cap=service.COFFEECHAT_COHORT_CAP)
    free = seating.assign(A, is_host, cohort, forbid=forbid, iters=20000, seed=43, sizes=sizes,
                          cohort_penalty=service.COFFEECHAT_COHORT_PENALTY, cohort_cap=service.COFFEECHAT_COHORT_CAP)
    old = seating.assign(A, is_host, cohort, forbid=forbid, iters=20000, seed=43, sizes=seating.group_sizes(n, 4), cohort_cap=2)
    rank = {i: k for k, i in enumerate(sorted((i for i in range(n) if cohort[i] >= 0), key=lambda i: (cohort[i], i)))}
    out = dict(new=score(new.table, service.COFFEECHAT_COHORT_CAP), free=score(free.table, service.COFFEECHAT_COHORT_CAP),
               old=score(old.table, 2),
               beyond20=sum(1 for i in anchors if rank[i] >= 2 * len(sizes)), beyond_tie=lp.beyond, skipped=lp.skipped,
               lead_met=lp.met, pool=len(lp.pool), lead_same=float(np.mean([P[a]["domains"][0] == P[b]["domains"][0] for a, b in lp.pairs])))
    if show:
        print(f"시드 {seed} · {n}명 · 테이블 {out['new']['sizes']} · 후보 {out['pool']}명")
        for t, (a, b) in enumerate(lp.pairs):
            f = lambda i: f"{P[i]['cohort']}기 {rank[i] + 1}위 {P[i]['domains'][0]}"
            print(f"  {t + 1:2d}번  {f(a)}  +  {f(b)}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="2026-2030")
    a = ap.parse_args()
    lo, hi = (int(x) for x in a.seeds.split("-")) if "-" in a.seeds else (int(a.seeds), int(a.seeds))
    enc = Encoder()
    rs = [run(s, enc, s == lo) for s in range(lo, hi + 1)]
    m = lambda f: np.mean([f(r) for r in rs])
    print(f"\n시드 {lo}~{hi} 평균")
    print(f"  주도 선배: 21위 아래 {m(lambda r: r['beyond20']):.1f}명(동률 기수 감안 {m(lambda r: r['beyond_tie']):.1f}) · "
          f"건너뛴 윗기수 {m(lambda r: r['skipped']):.1f} · 분야 일치 {m(lambda r: r['lead_same']):.0%} · 만난 둘 {m(lambda r: r['lead_met']):.1f}")
    for k, name in (("new", "10테이블 + 주도 선배"), ("free", "10테이블 주도 선배 없음"), ("old", "예전 3~4명 그룹")):
        print(f"  {name:16s} 쌍 점수 {m(lambda r: r[k]['pair']):.3f} · 좋은 상대 {m(lambda r: r[k]['good']):.2f}명 · "
              f"재회 {m(lambda r: r[k]['forbid']):.1f} · 기수 넘침 {m(lambda r: r[k]['cohort_over']):.1f}")


if __name__ == "__main__":
    main()
