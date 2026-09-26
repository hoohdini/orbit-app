"""리허설 정확도 계산 시험 — 점수대로 누르게 만든 가상 응답이면 정확도가 0.5 보다 높아야 하고, 무작위면 0.5 근처."""
from __future__ import annotations

import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from eval.rehearsal_accuracy import per_person_accuracy, satisfaction_auc  # noqa: E402


def fake_round(n=60, size=5, seed=0):
    rng = np.random.default_rng(seed)
    ids = [f"p{i}" for i in range(n)]
    members = [{"table_no": i // size + 1, "participant_id": p} for i, p in enumerate(ids)]
    a = rng.normal(size=(n, n))
    pairs = [{"a": ids[i], "b": ids[j], "score": float(min(a[i, j], a[j, i])), "score_ab": float(a[i, j]),
              "score_ba": float(a[j, i])} for i in range(n) for j in range(i + 1, n)]
    return ids, members, pairs, a


def test_signal_vs_random():
    ids, members, pairs, a = fake_round()
    rnd = random.Random(1)
    good, noise = set(), set()
    for i, p in enumerate(ids):
        mates = [j for j in range(len(ids)) if j // 5 == i // 5 and j != i]
        best = max(mates, key=lambda j: a[i, j])                  # 한 방향 점수가 가장 높은 동석자를 누름
        good.add((p, ids[best]))
        noise.add((p, ids[rnd.choice(mates)]))
    g = per_person_accuracy(pairs, members, good)
    r = per_person_accuracy(pairs, members, noise)
    assert g["one_way"]["정확도"] > 0.9 and g["one_way"]["판정"] == "0.5 보다 높음"
    assert 0.35 < r["one_way"]["정확도"] < 0.65
    print(f"  점수대로 누름 {g['one_way']['정확도']:.2f} · 무작위 {r['one_way']['정확도']:.2f}")


def test_satisfaction_auc():
    ids, members, pairs, a = fake_round()
    sat = {}
    for i, p in enumerate(ids):
        mates = [j for j in range(len(ids)) if j // 5 == i // 5 and j != i]
        m = np.mean([a[i, j] for j in mates])
        sat[p] = m
    cut = np.quantile(list(sat.values()), [1 / 3, 2 / 3])
    keys = ["mismatch", "unsure", "gained"]
    sat = {p: keys[int(np.searchsorted(cut, m))] for p, m in sat.items()}
    c = satisfaction_auc(pairs, members, sat)
    assert c["one_way"]["구분 정확도"] > 0.8
    assert c["one_way"]["얻음"] > 0 and c["one_way"]["못 얻음"] > 0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
