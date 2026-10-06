"""리허설 · 행사 뒤 한 번에 보는 보고서(v0.2 B-13, 10/6 민찬). 개발 DB 또는 행사 DB 를 읽기만 한다(쓰지 않음).

실행  cd services/compute && set -a; . ./.env; set +a; python eval/rehearsal_report.py <event_id>

보는 것
  1. 인원 · 응답률     체크인 수, 라운드별 만족도 응답률(리허설은 다 누르니 행사 때만 의미 있음)
  2. 답 분포           만족도 · 포스터 답이 한 칸에 몰리지 않았나(몰리면 구분이 안 돼 반영 효과가 없다)
  3. 배정이 맞았나      같은 테이블에서 고른 사람(만족도 사람 고르기, 없으면 동석자와의 명함 교환)의 점수가 안 고른 사람보다 높았나
                       (rehearsal_accuracy.per_person_accuracy, 0.5 보다 확실히 높아야 함) · 만족도 답으로 본 구분(satisfaction_auc)
  4. 쏠림              받은 명함 수의 지니 계수(0 고르게, 1 한 사람에게 몰림)와 한 장도 못 받은 사람 수
  5. 포스터 응답 간격   같은 사람의 연속 응답 사이 초. 빠른 연속 기준(지금 30초)을 다시 정할 때 본다
  6. 커피챗 계산 기록   걸러진 포스터 응답 수 · 만족도 답 수 등(assign_versions.params)
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from datetime import datetime

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from eval.rehearsal_accuracy import (concentration, per_person_accuracy, picks_from_exchanges,  # noqa: E402
                                     satisfaction_auc)

QUICK_GAP_S = 30


def _ts(v) -> float:
    return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()


def poster_gaps(rows: list[dict]) -> dict:
    """포스터 응답 행 → 같은 사람의 연속 응답 사이 초의 분포. 30초 안 비율도 같이."""
    by: dict[str, list[float]] = {}
    for r in rows:
        if r.get("created_at"):
            by.setdefault(r["participant_id"], []).append(_ts(r["created_at"]))
    gaps = np.array([b - a for ts in by.values() for a, b in zip(sorted(ts), sorted(ts)[1:])])
    if len(gaps) == 0:
        return {"간격 수": 0}
    q = np.percentile(gaps, [10, 25, 50, 75, 90])
    return {"간격 수": int(len(gaps)), "10·25·50·75·90% (초)": [round(float(x)) for x in q],
            f"{QUICK_GAP_S}초 안 비율": round(float((gaps < QUICK_GAP_S).mean()), 3)}


def picks_from_satisfaction_rows(rows: list[dict], members: list[dict]) -> tuple[set[tuple[str, str]], set[str]]:
    """만족도 행에 picks 칸이 있으면(0012) 같은 테이블 안에서 고른 쌍과 답한 사람. 없으면 빈 집합."""
    mates: dict[int, set[str]] = {}
    table_of = {m["participant_id"]: m["table_no"] for m in members}
    for m in members:
        mates.setdefault(m["table_no"], set()).add(m["participant_id"])
    picks, raters = set(), set()
    for r in rows:
        if "picks" not in r:
            continue
        p = r["participant_id"]
        raters.add(p)
        for q in r.get("picks") or []:
            if q != p and q in mates.get(table_of.get(p), set()):
                picks.add((p, q))
    return picks, raters


def main(event: str) -> None:
    from repo import SupabaseRepo
    r = SupabaseRepo()
    db = r.db
    P = r.participants(event)
    ids = [p["id"] for p in P]
    checked = r.checkins(ids)
    vers = r._all(lambda: db.table("assign_versions").select("version, round, status, params").eq("event_id", event))
    pub = {rd: max((v for v in vers if v["round"] == rd and v["status"] == "published"), key=lambda v: v["version"], default=None)
           for rd in ("tabletalk", "coffeechat")}
    sat = r._in("satisfaction", "*", "participant_id", ids)
    cards = [c for c in r.card_exchanges() if c["scanner_id"] in set(ids)]
    resp = r.poster_responses(ids)
    out: dict = {"행사": event, "참가자": len(ids), "체크인": len(checked)}

    out["1. 만족도 응답률"] = {rd: round(sum(1 for s in sat if s["round"] == rd) / max(len(checked), 1), 3)
                          for rd in ("tabletalk", "coffeechat")}
    out["2. 답 분포"] = {"만족도 " + rd: dict(Counter(s["choice"] for s in sat if s["round"] == rd)) for rd in ("tabletalk", "coffeechat")}
    out["2. 답 분포"]["포스터"] = dict(Counter(x["reason"] for x in resp))

    acc = {}
    for rd, v in pub.items():
        if not v:
            continue
        members = r._all(lambda: db.table("table_members").select("participant_id, table_no").eq("version", v["version"]))
        pairs = r._all(lambda: db.table("pair_scores").select("*").eq("version", v["version"]))
        rows = [s for s in sat if s["round"] == rd]
        picks, raters = picks_from_satisfaction_rows(rows, members)
        source = "만족도 사람 고르기"
        if not picks:
            picks, raters, source = picks_from_exchanges(cards, members), None, "동석자와 명함 교환"
        acc[rd] = {"버전": v["version"], "고른 쌍 출처": source, "고른 쌍": len(picks),
                   "사람별 정확도": per_person_accuracy(pairs, members, picks, raters),
                   "만족도 구분": satisfaction_auc(pairs, members, {s["participant_id"]: s["choice"] for s in rows})}
    out["3. 배정이 맞았나"] = acc
    out["4. 쏠림"] = concentration(cards, list(checked))
    out["5. 포스터 응답 간격"] = poster_gaps(resp)
    cc = pub.get("coffeechat")
    if cc:
        keep = ("response_rate", "fallback", "sat_counts", "cards", "poster_filter", "poster_answers", "poster_people",
                "forbid_hits", "cohort_over", "group_sizes", "kind")
        out["6. 커피챗 계산 기록"] = {k: cc["params"].get(k) for k in keep if k in (cc["params"] or {})}
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("사용법: python eval/rehearsal_report.py <event_id>")
    main(sys.argv[1])
