"""좌석 배정 비교 평가 — 무작위 · 운영진 수기 규칙 두 가지 · 추천 알고리즘 · 정답 상한 (2026-10-17).

데이터는 make_seat_eval_dataset.py 의 가상 80명. 알고리즘은 CSV 에 들어갈 문장만 보고(실제 e5 모델, service.precompute ·
service.coffeechat 과 같은 함수 · 상수), 채점은 숨은 속성(truth)으로 한다. 같은 문장으로 채점하면 순환이라 그렇게 나눴다.

비교군
  random      무작위. 커피챗은 테이블토크 동석자와 다시 만나지 않게 자리 바꾸기로 고친다
  op_cohort   운영진 기수 규칙(연명부 2번 시트의 실제 수기 배정표): 윗기수 선배를 테이블마다 한 명씩 앵커로 깔고 기수를 섞는다
  op_tag      운영진 태그 규칙: 설문의 첫 관심 태그를 보고 같은 태그끼리 모으고 선배는 테이블마다 나눈다(사람이 할 수 있는 최선에 가깝게)
  algorithm   추천 알고리즘(서비스와 같은 경로)
  oracle      정답을 아는 경우의 상한(근사). 채점 기준(두 방향 평균 효용)을 같은 담금질로 직접 올린다. 담금질이 근사라 넘을 수도 있다

정답 효용 u(i→j) = 0.5 × 필요 충족 + 0.5 × 분야 겹침, 이미 아는 사이면 × 0.5
  필요 충족 = i 가 원하는 것(goals) 중 j 가 채워 줄 수 있는 비율. 채용은 구직 중인 사람이, 연구협업 · 창업은 같은 걸 원하는 사람도 채운다
  분야 겹침 = 주 분야가 같으면 1, 관심 분야가 하나라도 겹치면 0.6, 아니면 0
  좋은 만남 = 필요 충족 > 0 이고 분야 겹침 > 0 이고 처음 보는 사이(가중치를 고르지 않는 지표)

실행  cd services/compute && .venv/bin/python sim/eval_seating.py [--seeds 2026,2027,2028,2029,2030] [--random 1000] [--variants base,c_avg]
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from make_seat_eval_dataset import make  # noqa: E402
from pipeline import scoring, seating  # noqa: E402
from pipeline.embed import Encoder, offer_items, seek_items  # noqa: E402
from pipeline.people import acquainted  # noqa: E402
from service import (COFFEECHAT_COHORT_CAP, COFFEECHAT_GROUP_MAX, TABLETALK_COHORT_CAP,  # noqa: E402
                     TABLETALK_COHORT_PENALTY)

BASELINES = ["random", "op_cohort", "op_tag"]
NAMES = {"random": "무작위", "op_cohort": "운영진(기수 규칙)", "op_tag": "운영진(태그 규칙)", "oracle": "정답 상한(근사)"}
# 알고리즘 쌍 점수 후보: 이름 → (평균 빼기, 분야 유사도 비율, 두 방향 결합). base 가 10/17 까지의 서비스 기본값.
# mix5_min 은 개발 시드(2026~2028)에서 행사 전체 좋은 만남 수로 고르고, 시험 시드(2029~2033)로만 성적을 낸다
VARIANTS = {"base": (False, 0.0, "min"), "c_min": (True, 0.0, "min"), "c_avg": (True, 0.0, "avg"),
            "mix5_min": (True, 0.5, "min"), "mix5_avg": (True, 0.5, "avg"), "mix7_avg": (True, 0.7, "avg")}


# ---------- 정답 ----------

def satisfies(goal: str, q: dict) -> bool:
    if goal in q["gives"]:
        return True
    if goal == "채용":
        return bool({"취업정보", "이직정보"} & set(q["goals"]))
    if goal in ("연구협업", "창업"):
        return goal in q["goals"]
    return False


def truth(P: list[dict], know: np.ndarray):
    n = len(P)
    need, dom = np.zeros((n, n)), np.zeros((n, n))
    for i, p in enumerate(P):
        for j, q in enumerate(P):
            if i == j:
                continue
            need[i, j] = sum(satisfies(g, q) for g in p["goals"]) / len(p["goals"])
            dom[i, j] = 1.0 if p["domains"][0] == q["domains"][0] else 0.6 if set(p["domains"]) & set(q["domains"]) else 0.0
    damp = np.where(know, 0.5, 1.0)
    return dict(U=(0.5 * need + 0.5 * dom) * damp, U_need=need * damp, U_dom=dom * damp,
                good=(need > 0) & (dom > 0) & ~know, need=need)


def metrics(groups: list[list[int]], P, T, know, cap: int) -> dict:
    sat, sat_n, sat_d, good, cover = [], [], [], [], []
    known_pairs = over = 0
    for g in groups:
        for i in g:
            m = [j for j in g if j != i]
            sat.append(T["U"][i, m].mean())
            sat_n.append(T["U_need"][i, m].mean())
            sat_d.append(T["U_dom"][i, m].mean())
            good.append(int(T["good"][i, m].sum()))
            goals = P[i]["goals"]
            cover.append(sum(any(satisfies(x, P[j]) for j in m) for x in goals) / len(goals))
        known_pairs += int(know[np.ix_(g, g)].sum() // 2)
        coh = [P[i]["cohort"] for i in g if P[i]["cohort"] is not None]
        over += sum(max(0, coh.count(c) - cap) for c in set(coh))
    sat = np.array(sat)
    k = max(1, len(sat) // 10)
    s = np.sort(sat)
    gini = float(np.abs(sat[:, None] - sat[None, :]).mean() / (2 * sat.mean())) if sat.mean() > 0 else 0.0
    return dict(sat=float(sat.mean()), sat_p10=float(s[:k].mean()), sat_need=float(np.mean(sat_n)), sat_dom=float(np.mean(sat_d)),
                good=float(np.mean(good)), isolated=float(np.mean(np.array(good) == 0)), cover=float(np.mean(cover)),
                known_pairs=known_pairs, cohort_over=over, gini=gini)


# ---------- 배정 방법 ----------

def split(order: list[int], sizes: list[int]) -> list[list[int]]:
    out, k = [], 0
    for s in sizes:
        out.append(order[k:k + s])
        k += s
    return out


def repair(groups, forbid, rng, tries=20000):
    """무작위 그룹에서 금지 쌍(이전 동석자)을 자리 바꾸기로 줄인다. 무작위 커피챗도 같은 사람을 다시 만나지 않게 하는 것이 공정하다.
    충돌이 있는 사람 하나와 아무 사람 하나를 바꿔서 두 사람의 충돌 합이 줄면 받아들인다."""
    g = [list(x) for x in groups]
    where = {i: t for t, x in enumerate(g) for i in x}
    clash = lambda i, t, skip=None: sum(forbid[i, j] for j in g[t] if j != i and j != skip)
    people = list(where)
    for _ in range(tries):
        bad = [i for i in people if clash(i, where[i])]
        if not bad:
            break
        i, j = rng.choice(bad), rng.choice(people)
        a, b = where[i], where[j]
        if a == b:
            continue
        before = clash(i, a) + clash(j, b)
        after = clash(i, b, skip=j) + clash(j, a, skip=i)
        if after < before:
            g[a][g[a].index(i)], g[b][g[b].index(j)] = j, i
            where[i], where[j] = b, a
    return g


def random_groups(pop, sizes, rng, forbid=None):
    order = list(pop)
    rng.shuffle(order)
    g = split(order, sizes)
    return repair(g, forbid, rng) if forbid is not None else g


def greedy(pop, P, sizes, rng, key, cap, forbid=None, order=lambda i: 0):
    """운영진 손 배정 흉내. 선배(호스트)를 먼저 테이블마다 고르게, 그다음 나머지를 key 가 가장 큰 빈 테이블로.
    같은 기수 cap 명 · 이전 동석자는 피하고, 피할 곳이 없으면 아무 빈자리."""
    tables = [[] for _ in sizes]
    hosts = [i for i in pop if P[i]["host"]]
    rest = [i for i in pop if not P[i]["host"]]
    rng.shuffle(hosts)
    rng.shuffle(rest)
    for group in (hosts, rest):
        for i in sorted(group, key=order):
            open_t = [t for t in range(len(sizes)) if len(tables[t]) < sizes[t]]
            ok = [t for t in open_t
                  if sum(P[j]["cohort"] == P[i]["cohort"] for j in tables[t]) < cap or P[i]["cohort"] is None]
            if forbid is not None:
                ok = [t for t in ok if not any(forbid[i, j] for j in tables[t])]
            t = max(ok or open_t, key=lambda t: key(i, t, tables))
            tables[t].append(i)
    return tables


def op_cohort(pop, P, sizes, rng, cap, forbid=None):
    # 선배는 윗기수부터 테이블마다 한 명씩, 나머지는 가장 덜 찬 테이블 · 호스트가 적은 테이블로(기수를 섞는다)
    key = lambda i, t, T: (-sum(P[j]["host"] for j in T[t]) if P[i]["host"] else 0, -len(T[t]), rng.random())
    return greedy(pop, P, sizes, rng, key, cap, forbid, order=lambda i: P[i]["cohort"] or 0)


def op_tag(pop, P, sizes, rng, cap, forbid=None):
    tag = lambda i: P[i]["topic_tags"][0]

    def key(i, t, T):
        same = sum(tag(j) == tag(i) for j in T[t])
        if P[i]["host"]:
            return (-sum(P[j]["host"] for j in T[t]), same, -len(T[t]), rng.random())
        return (same, -len(T[t]), rng.random())
    count = {}
    for i in pop:
        count[tag(i)] = count.get(tag(i), 0) + 1
    return greedy(pop, P, sizes, rng, key, cap, forbid, order=lambda i: (-count[tag(i)], tag(i)))   # 많은 태그부터 묶는다


def anneal(A, pop, P, sizes, cap, seed, forbid=None, penalty=TABLETALK_COHORT_PENALTY):
    idx = np.array(pop)
    is_host = np.array([P[i]["host"] for i in pop])
    cohort = np.array([P[i]["cohort"] if P[i]["cohort"] is not None else -1 for i in pop])
    kw = dict(sizes=sizes, cohort_cap=cap, seed=seed, iters=20000)
    if penalty is not None:
        kw["cohort_penalty"] = penalty
    r = seating.assign(A[np.ix_(idx, idx)], is_host, cohort, forbid=None if forbid is None else forbid[np.ix_(idx, idx)], **kw)
    return [list(idx[r.table == t]) for t in range(len(sizes))]


def mates(groups, n):
    M = np.zeros((n, n), bool)
    for g in groups:
        M[np.ix_(g, g)] = True
    np.fill_diagonal(M, False)
    return M


# ---------- 한 데이터셋 ----------

def run_dataset(seed, enc, n_random, variants):
    P = make(seed)
    n = len(P)
    know = acquainted([dict(cohort=p["cohort"], affiliation=p["affiliation"], teams=p["teams"]) for p in P])
    T = truth(P, know)
    is_host = np.array([p["host"] for p in P])

    # 알고리즘이 보는 것: 문장 → 벡터 → 쌍 점수 (service._embed 와 같은 순서)
    O, _ = enc.people([offer_items(p["offer_text"], p["topic_tags"]) for p in P])
    S, blank = enc.people([seek_items(p["seek_text"], p["intent_tags"]) for p in P])
    S = scoring.fill_blank_seek(S, O, blank)
    A_alg = {}
    for v in variants:
        center, w, mode = VARIANTS[v]
        A_alg[v] = scoring.table_matrix(scoring.pair_directional(S, O, center, w), is_host, mode)
    A_true = (T["U"] + T["U"].T) / 2                       # 정답 상한: 채점과 같은 기준(모든 쌍, 두 방향 평균)을 직접 최적화

    tt_pop = [i for i, p in enumerate(P) if p["tabletalk"]]
    cc_pop = [i for i, p in enumerate(P) if p["coffeechat"]]
    tt_sizes = seating.even_sizes(len(tt_pop), 9)           # 2~10번 9테이블: 8명 7개 · 7명 2개
    cc_sizes = seating.group_sizes(len(cc_pop), COFFEECHAT_GROUP_MAX)
    assert sorted(tt_sizes, reverse=True) == [8] * 7 + [7] * 2, tt_sizes

    def event(method, rng):
        if method == "random":
            tt = random_groups(tt_pop, tt_sizes, rng)
        elif method == "op_cohort":
            tt = op_cohort(tt_pop, P, tt_sizes, rng, TABLETALK_COHORT_CAP)
        elif method == "op_tag":
            tt = op_tag(tt_pop, P, tt_sizes, rng, TABLETALK_COHORT_CAP)
        elif method.startswith("alg:"):
            tt = anneal(A_alg[method[4:]], tt_pop, P, tt_sizes, TABLETALK_COHORT_CAP, seed=42)
        else:
            tt = anneal(A_true, tt_pop, P, tt_sizes, TABLETALK_COHORT_CAP, seed=42)
        forbid = mates(tt, n)
        if method == "random":
            cc = random_groups(cc_pop, cc_sizes, rng, forbid)
        elif method == "op_cohort":
            cc = op_cohort(cc_pop, P, cc_sizes, rng, COFFEECHAT_COHORT_CAP, forbid)
        elif method == "op_tag":
            cc = op_tag(cc_pop, P, cc_sizes, rng, COFFEECHAT_COHORT_CAP, forbid)
        else:
            cc = anneal(A_alg[method[4:]] if method.startswith("alg:") else A_true, cc_pop, P, cc_sizes, COFFEECHAT_COHORT_CAP, seed=43,
                        forbid=forbid, penalty=None)
        met = forbid | mates(cc, n)
        tot_good = [int((T["good"][i] & met[i]).sum()) for i in tt_pop]
        repeat = int((forbid & mates(cc, n)).sum() // 2)
        return dict(tt=metrics(tt, P, T, know, TABLETALK_COHORT_CAP),
                    cc=metrics(cc, P, T, know, COFFEECHAT_COHORT_CAP),
                    event=dict(good_total=float(np.mean(tot_good)), isolated_total=float(np.mean(np.array(tot_good) == 0)),
                               repeat_pairs=repeat))

    out = {}
    rng = random.Random(seed)
    for m in ("op_cohort", "op_tag"):                       # 손 배정은 순서에 따라 달라져 20번 평균
        runs = [event(m, random.Random(seed * 100 + r)) for r in range(20)]
        out[m] = avg(runs)
    for m in [f"alg:{v}" for v in variants] + ["oracle"]:
        out[m] = event(m, rng)
    rand_runs = [event("random", random.Random(seed * 10000 + r)) for r in range(n_random)]
    out["random"] = avg(rand_runs)
    out["_random_dist"] = {f"{part}.{k}": [r[part][k] for r in rand_runs] for part, k in DERIVED_KEYS}
    return out


def avg(runs):
    return {part: {k: float(np.mean([r[part][k] for r in runs])) for k in runs[0][part]} for part in runs[0]}


# ---------- 보고 ----------

DERIVED_KEYS = [("tt", "sat"), ("tt", "good"), ("cc", "sat"), ("cc", "good"), ("event", "good_total")]
DERIVED_LABEL = {"tt.sat": "테이블토크 만족", "tt.good": "테이블토크 좋은 만남", "cc.sat": "커피챗 만족", "cc.good": "커피챗 좋은 만남",
                 "event.good_total": "행사 전체 좋은 만남"}

ROWS = [("tt", "sat", "평균 만족(정답 효용)", "{:.3f}"), ("tt", "sat_p10", "하위 10% 만족", "{:.3f}"),
        ("tt", "good", "좋은 만남 수(인당)", "{:.2f}"), ("tt", "isolated", "좋은 만남 0명 비율", "{:.1%}"),
        ("tt", "cover", "원하는 것 충족률", "{:.1%}"), ("tt", "known_pairs", "아는 사이 동석 쌍", "{:.1f}"),
        ("tt", "cohort_over", "같은 기수 초과(명)", "{:.1f}"), ("tt", "gini", "만족 불평등(지니)", "{:.3f}"),
        ("tt", "sat_need", "[견고성] 필요 충족만", "{:.3f}"), ("tt", "sat_dom", "[견고성] 분야 겹침만", "{:.3f}"),
        ("cc", "sat", "커피챗 평균 만족", "{:.3f}"), ("cc", "good", "커피챗 좋은 만남 수", "{:.2f}"),
        ("cc", "isolated", "커피챗 좋은 만남 0명", "{:.1%}"),
        ("event", "good_total", "행사 전체 좋은 만남 수", "{:.2f}"), ("event", "isolated_total", "행사 전체 0명 비율", "{:.1%}"),
        ("event", "repeat_pairs", "커피챗 재회 쌍", "{:.1f}")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="2026,2027,2028,2029,2030")
    ap.add_argument("--random", type=int, default=1000)
    ap.add_argument("--variants", default="base", help="알고리즘 쌍 점수 후보(쉼표). " + ", ".join(VARIANTS))
    ap.add_argument("--out", default=os.path.join(HERE, "seat_eval_results.json"))
    a = ap.parse_args()
    seeds = [int(s) for s in a.seeds.split(",")]
    variants = a.variants.split(",")
    algs = [f"alg:{v}" for v in variants]
    METHODS = BASELINES + algs + ["oracle"]
    NAMES.update({f"alg:{v}": f"알고리즘({v})" for v in variants})

    t0 = time.time()
    enc = Encoder()
    res = {}
    for s in seeds:
        t = time.time()
        res[s] = run_dataset(s, enc, a.random, variants)
        print(f"데이터셋 seed {s} 끝 ({time.time() - t:.0f}초)", flush=True)

    agg = {m: {part: {k: (float(np.mean([res[s][m][part][k] for s in seeds])), float(np.std([res[s][m][part][k] for s in seeds])))
                      for k in res[seeds[0]][m][part]} for part in res[seeds[0]][m]} for m in METHODS}
    print(f"\n가상 80명 × 데이터셋 {len(seeds)}개, 무작위 {a.random}회/데이터셋, 손 배정 20회/데이터셋 평균 ({time.time() - t0:.0f}초)\n")
    print("| 지표 | " + " | ".join(NAMES[m] for m in METHODS) + " |")
    print("|---|" + "---:|" * len(METHODS))
    for part, k, label, f in ROWS:
        print(f"| {label} | " + " | ".join(f.format(agg[m][part][k][0]) for m in METHODS) + " |")

    print("\n파생 지표 (데이터셋 평균)")
    derived = {}
    for alg in algs:
        print(f" {NAMES[alg]}")
        for part, k in DERIVED_KEYS:
            key = f"{part}.{k}"
            pct, lift, lift_op = [], [], []
            for s in seeds:
                r = res[s]
                v, rnd = r[alg][part][k], r["random"][part][k]
                pct.append(float(np.mean(np.array(r["_random_dist"][key]) < v)))
                lift.append(v / rnd)
                lift_op.append(v / max(r["op_cohort"][part][k], r["op_tag"][part][k]))
            d = derived.setdefault(alg, {})[key] = dict(
                random_percentile=float(np.mean(pct)), lift_random=float(np.mean(lift)),
                lift_best_operator=float(np.mean(lift_op)))
            print(f"  {DERIVED_LABEL[key]}: 무작위 대비 {d['lift_random']:.2f}배 · 더 나은 운영진 규칙 대비 {d['lift_best_operator']:.2f}배 · "
                  f"무작위 {a.random}회보다 나은 비율 {d['random_percentile']:.1%}")

    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"seeds": seeds, "n_random": a.random, "agg": agg, "derived": derived,
                   "variants": {v: VARIANTS[v] for v in variants}, "per_seed": {s: {m: res[s][m] for m in METHODS} for s in seeds}}, f, ensure_ascii=False, indent=1)
    print(f"\n결과 → {a.out}")


if __name__ == "__main__":
    main()
