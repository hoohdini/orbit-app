"""리허설 · 행사 뒤 한 번에 보는 보고서(v0.2 B-13, 10/6 민찬). 개발 DB 또는 행사 DB 를 읽기만 한다(쓰지 않음).

실행  cd services/compute && set -a; . ./.env; set +a; python eval/rehearsal_report.py <event_id>

보는 것
  1. 인원 · 응답률     체크인한 사람 중 라운드별 만족도에 답한 비율(리허설은 다 누르니 행사 때만 의미 있음).
                       커피챗 분모는 체크인이 아니라 평가 대상 커피챗 버전에 배정된 인원(행사 직후 추천 버전이 아닌 원래 커피챗 배정). 분자도 그 배정에 있던 사람만 센다
  2. 답 분포           만족도 · 포스터 답이 한 칸에 몰리지 않았나(몰리면 구분이 안 돼 반영 효과가 없다)
  3. 배정이 맞았나      같은 테이블에서 고른 사람(만족도 사람 고르기, 없으면 동석자와의 명함 교환)의 점수가 안 고른 사람보다 높았나
                       (rehearsal_accuracy.per_person_accuracy, 0.5 보다 확실히 높아야 함) · 만족도 답으로 본 구분(satisfaction_auc,
                       0012 이후 'different' = 조금 얻었어요 라서 이 구분은 '많이 얻었어요' vs 나머지)
  4. 쏠림              받은 명함 수의 지니 계수(0 고르게, 1 한 사람에게 몰림)와 한 장도 못 받은 사람 수(운영 콘솔 A-01 과 같은 정의)
  5. 포스터 응답 간격   같은 사람의 연속 응답 사이 초. 빠른 연속 기준(지금 30초)을 다시 정할 때 본다
  6. 커피챗 계산 기록   걸러진 포스터 응답 수 · 만족도 답 수 등(assign_versions.params). 행사 직후 추천(final) 버전이
                       있으면 그 버전은 평가하지 않고 한 줄만 보여준다(커피챗 자리에서 한 명함 교환을 점수에 이미 넣어서 정확도가 부풂)

버전 선택  tabletalk 는 published · retired 중 최신판. coffeechat 은 같은 상태 중 params.kind 가 'final' 이 아닌
          버전의 최신판을 평가한다(운영 콘솔 수동 교체본 kind='swap' 도 실제로 앉은 배정이라 포함. 계산 서비스 coffeechat_source 와 같은 규칙).
          kind='final'(행사 직후 추천: 그룹은 그대로, 추천만 다시) 버전은 공개하면 원래 커피챗 버전이 물러나므로, 평가에는 안 쓰고 버전 · 상태만 보여준다.
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
SAT_MIN_ELAPSED_MS = 1000   # 질문이 뜬 뒤 1초도 안 돼 낸 답은 대충 누른 것으로 보고 반영하지 않는다(계산 서비스 SAT_MIN_ELAPSED_MS 와 같음)


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
    """만족도 행에 picks 칸이 있으면(0012) 같은 테이블 안에서 고른 쌍과 답한 사람. 없으면 빈 집합.
    rows 는 main() 에서 1초 미만 답을 이미 뺀 것을 넘겨준다(계산 서비스 SAT_MIN_ELAPSED_MS 와 같은 기준)."""
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


def _drop_quick_answers(rows: list[dict]) -> tuple[list[dict], int]:
    """elapsed_ms < 1000(None 이면 그대로 둠) 인 행을 뺀다. (남은 행, 뺀 수)."""
    kept = [r for r in rows if not (r.get("elapsed_ms") is not None and r["elapsed_ms"] < SAT_MIN_ELAPSED_MS)]
    return kept, len(rows) - len(kept)


def select_version(vers: list[dict], round_: str) -> tuple[dict | None, dict | None]:
    """라운드별 평가할 버전. published · retired 상태만 본다(둘 다 한 번은 공개됐던 버전).
    coffeechat 은 params.kind 가 'final' 이 아닌 것(coffeechat · swap · 옛 행)만 평가 후보로 두고,
    kind == 'final' 인 버전(행사 직후 추천)이 있으면 그건 평가하지 않고 따로 돌려준다."""
    rows = [v for v in vers if v["round"] == round_ and v["status"] in ("published", "retired")]
    final = None
    if round_ == "coffeechat":
        final = max((v for v in rows if (v.get("params") or {}).get("kind") == "final"),
                    key=lambda v: v["version"], default=None)
        rows = [v for v in rows if (v.get("params") or {}).get("kind") != "final"]
    picked = max(rows, key=lambda v: v["version"], default=None)
    return picked, final


def main(event: str) -> None:
    from repo import SupabaseRepo
    r = SupabaseRepo()
    db = r.db
    P = r.participants(event)
    ids = [p["id"] for p in P]
    ids_set = set(ids)                                                  # 행마다 다시 만들지 않게 미리 집합으로
    checked = r.checkins(ids)
    vers = r._all(lambda: db.table("assign_versions").select("version, round, status, params").eq("event_id", event))
    pub: dict[str, dict | None] = {}
    final_cc = None
    for rd in ("tabletalk", "coffeechat"):
        pub[rd], final = select_version(vers, rd)
        if rd == "coffeechat":
            final_cc = final
    sat = r._in("satisfaction", "*", "participant_id", ids)
    cards = [c for c in r.card_exchanges() if c["scanner_id"] in ids_set]
    resp = r.poster_responses(ids)
    out: dict = {"행사": event, "참가자": len(ids), "체크인": len(checked)}

    members_by_round: dict[str, list[dict]] = {}
    for rd, v in pub.items():
        if v:
            members_by_round[rd] = r._all(lambda: db.table("table_members").select("participant_id, table_no").eq("version", v["version"]))

    def resp_rate(rd: str, who: set, denom_label: str) -> dict:
        n = sum(1 for s in sat if s["round"] == rd and s["participant_id"] in who)
        denom = len(who)
        return {"응답": n, "분모": denom, "분모 기준": denom_label, "비율": round(n / max(denom, 1), 3)}

    out["1. 만족도 응답률"] = {
        "tabletalk": resp_rate("tabletalk", set(checked), "체크인"),
        "coffeechat": resp_rate("coffeechat", {m["participant_id"] for m in members_by_round.get("coffeechat") or []}, "커피챗 배정 인원"),
    }
    out["2. 답 분포"] = {"만족도 " + rd: dict(Counter(s["choice"] for s in sat if s["round"] == rd)) for rd in ("tabletalk", "coffeechat")}
    out["2. 답 분포"]["포스터"] = dict(Counter(x["reason"] for x in resp))

    acc = {}
    for rd, v in pub.items():
        if not v:
            continue
        members = members_by_round[rd]
        pairs = r._all(lambda: db.table("pair_scores").select("*").eq("version", v["version"]))
        rows, dropped = _drop_quick_answers([s for s in sat if s["round"] == rd])
        picks, raters = picks_from_satisfaction_rows(rows, members)
        source = "만족도 사람 고르기"
        if not picks:
            picks, raters, source = picks_from_exchanges(cards, members), None, "동석자와 명함 교환"
        acc[rd] = {"버전": v["version"], "고른 쌍 출처": source, "고른 쌍": len(picks), "1초 미만 답 뺌": dropped,
                   "사람별 정확도": per_person_accuracy(pairs, members, picks, raters),
                   "만족도 구분": satisfaction_auc(pairs, members, {s["participant_id"]: s["choice"] for s in rows})}
    out["3. 배정이 맞았나"] = acc
    if final_cc:
        out["3b. 커피챗 final 버전(평가 안 함)"] = {"버전": final_cc["version"], "상태": final_cc["status"]}
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
