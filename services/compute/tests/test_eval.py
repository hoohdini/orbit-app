"""리허설 정확도 계산 시험 — 점수대로 누르게 만든 가상 응답이면 정확도가 0.5 보다 높아야 하고, 무작위면 0.5 근처."""
from __future__ import annotations

import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from eval.rehearsal_accuracy import per_person_accuracy, picks_from_satisfaction, satisfaction_auc  # noqa: E402


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


def test_no_poster_and_concentration():
    from eval.rehearsal_accuracy import concentration, gini, picks_from_exchanges
    ids, members, pairs, a = fake_round(n=20, size=4)
    for r in pairs:
        r["score_no_poster"] = r["score"] * 0.5
    sat = {p: ("gained" if k % 2 else "mismatch") for k, p in enumerate(ids)}
    out = satisfaction_auc(pairs, members, sat)
    assert "no_poster" in out and "score" in out
    assert gini([1, 1, 1, 1]) == 0.0 and gini([0, 0, 0, 8]) > 0.7
    rows = [{"scanner_id": "p0", "scanned_id": "p1"}, {"scanner_id": "p1", "scanned_id": "p0"},
            {"scanner_id": "p0", "scanned_id": "p9"},                                        # 다른 테이블 → 양성 아님
            {"scanner_id": "p2", "scanned_id": "p3", "status": "pending"}]
    assert picks_from_exchanges(rows, members) == {("p0", "p1"), ("p1", "p0")}
    # 0010 뒤에는 모든 행에 first_meet 칸이 있고 대부분 null(질문 건너뜀) → 그래도 교환은 센다
    assert picks_from_exchanges([{**r, "first_meet": None} for r in rows], members) == {("p0", "p1"), ("p1", "p0")}
    c = concentration(rows, ids)
    assert c["사람"] == 20 and c["못 받은 사람"] == 17
    # A-01(apps/web/.../ops/status/route.ts) 과 같은 정의: source='auto' 는 안 세고, status 는 confirmed 만 센다
    rows_auto = rows + [{"scanner_id": "p5", "scanned_id": "p6", "source": "auto"},          # 명찰 QR 만 찍음 → 안 셈
                        {"scanner_id": "p5", "scanned_id": "p7", "status": "declined"}]      # confirmed 아님 → 안 셈
    c2 = concentration(rows_auto, ids)
    assert c2["못 받은 사람"] == 17 and c2 == c



def test_report_helpers():
    from eval.rehearsal_report import picks_from_satisfaction_rows, poster_gaps
    rows = [{"participant_id": "a", "created_at": "2026-10-31T16:20:00+09:00"},
            {"participant_id": "a", "created_at": "2026-10-31T16:20:20+09:00"},     # 20초
            {"participant_id": "a", "created_at": "2026-10-31T16:25:20+09:00"},     # 300초
            {"participant_id": "b", "created_at": "2026-10-31T16:30:00+09:00"}]
    g = poster_gaps(rows)
    assert g["간격 수"] == 2 and g["30초 안 비율"] == 0.5
    assert poster_gaps([]) == {"간격 수": 0}
    members = [{"participant_id": p, "table_no": t} for p, t in (("a", 1), ("b", 1), ("c", 2))]
    picks, raters = picks_from_satisfaction_rows([{"participant_id": "a", "picks": ["b", "c"]}, {"participant_id": "b", "picks": []},
                                                  {"participant_id": "c", "choice": "gained"}], members)
    assert picks == {("a", "b")} and raters == {"a", "b"}                 # 다른 테이블 c 는 뺌, picks 칸 없는 행은 무시


def test_drop_quick_answers():
    from eval.rehearsal_report import _drop_quick_answers
    rows = [{"participant_id": "a", "elapsed_ms": 3000}, {"participant_id": "b", "elapsed_ms": 200},    # 0.2초 → 뺌
            {"participant_id": "c", "elapsed_ms": None}, {"participant_id": "d"}]                        # 없으면 그대로 둠
    kept, dropped = _drop_quick_answers(rows)
    assert dropped == 1 and [r["participant_id"] for r in kept] == ["a", "c", "d"]


def test_select_version():
    from eval.rehearsal_report import select_version
    vers = [
        {"version": 1, "round": "coffeechat", "status": "retired", "params": {"kind": "coffeechat"}},
        {"version": 2, "round": "coffeechat", "status": "published", "params": {"kind": "final"}},      # 행사 직후 추천 → 평가 제외
        {"version": 1, "round": "tabletalk", "status": "draft", "params": {}},                          # draft → 제외
        {"version": 2, "round": "tabletalk", "status": "retired", "params": {}},
    ]
    picked, final = select_version(vers, "coffeechat")
    assert picked["version"] == 1 and final["version"] == 2 and final["status"] == "published"
    vers.append({"version": 3, "round": "coffeechat", "status": "published", "params": {"kind": "swap"}})   # 운영 콘솔 수동 교체본
    picked, _ = select_version(vers, "coffeechat")
    assert picked["version"] == 3                                     # 실제로 앉은 교체본을 평가
    picked_tt, final_tt = select_version(vers, "tabletalk")
    assert picked_tt["version"] == 2 and final_tt is None



def test_picks_from_satisfaction():
    members = [{"participant_id": p, "table_no": t} for p, t in (("a", 1), ("b", 1), ("c", 1), ("d", 2))]
    rows = [{"participant_id": "a", "picks": ["b", "d"], "elapsed_ms": 3000},      # d 는 다른 테이블 → 뺌
            {"participant_id": "b", "picks": [], "elapsed_ms": 5000},              # 안 골라도 답한 사람
            {"participant_id": "c", "picks": ["a"], "elapsed_ms": 200}]            # 0.2초 → 뺌
    picks, raters = picks_from_satisfaction(rows, members)
    assert picks == {("a", "b")} and raters == {"a", "b"}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
