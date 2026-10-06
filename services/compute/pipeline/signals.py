"""반영 신호 정리 (개발 지시서 v0.2 B-05 · B-11). 커피챗 계산에 넣기 전에 명함 교환 · 포스터 응답을 거르고 가중치를 붙인다.

미션(②~④ 명함, ① 포스터)과 특별 시상 때문에 이 두 신호는 부풀 수 있다(운영진 지적: 미션이 걸리면 의도가 섞임).
그래서 원본은 그대로 쌓고, 추천 계산에 쓸 때만 여기서 낮추거나 버린다. 모든 값은 출발값이고 리허설 응답 분포를 보고 다시 정한다.

명함 교환   확인된 교환은 모두 1.0, 확인 대기(이름 검색 교환에서 상대가 아직 확인 안 함)만 뺀다(10/5 민찬 결정).
            지시서 v0.2 B-05 는 첫 대화 체크 1.0 · 그 밖 0.5 였지만, 처음 만난 사이에 명찰만 찍고 대화를 안 하는 경우는 드물어
            체크 여부로 진짜 대화를 가를 수 없다고 봤다. 첫 대화 체크(first_meet)는 집계에만 남긴다
포스터 응답 이유 가중  주제가 흥미로움 1.0 · 방법이 궁금함 0.7 · 새롭게 접한 분야 0.5 · 내 경험과 관련 있음 0.3 (부정 선택지 없음 → 밀어내기 없음)
            미션 할인    없음(10/5 민찬 결정). 지시서는 미션 ① 의 처음 2건 × 0.5 였지만, 미션 때문에 2개만 보더라도 가장 관심 있는
                         포스터부터 볼 가능성이 커서 가장 진짜인 신호를 깎을 수 있다. seq_no 는 저장해 두고 리허설에서
                         1 · 2번째와 3번째 이후의 이유 분포를 비교한다
            퀴즈         풀어 봤으면 × 1.2
            버림         스캔부터 제출까지 5초 미만 · 발표자 본인 · 발표자와 같은 소속
            빠른 연속    직전 응답과 30초 안에 낸 응답 × 0.5(그 응답만. 첫 응답은 그대로). 포스터를 읽고 옮겨 가는 시간이 없었던 응답.
                         지시서의 '1분 안 3건 이상이면 묶음 전부' 대신(10/5 민찬 결정: 처음 제대로 읽은 응답까지 깎지 않게).
                         30초는 임시값. 리허설 응답 간격 분포에서 읽은 사람 · 훑은 사람이 갈리는 지점으로 다시 정한다
            남은 응답이 2건 미만인 사람은 포스터 반영을 하지 않는다
            위치 보정(방문 많은 포스터일수록 낮춤)은 넣지 않았다. 지시서 식 log(응답자 수 ÷ 방문자 수)는 '응답자'를 그 포스터로 읽으면
            늘 0 이하, 전체로 읽으면 뜻이 맞는다. 어느 쪽인지 · 방문자를 무엇으로 셀지 팀 확인 대기(docs/DATA_SPEC.md)
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

CARD_FIRST_MEET = 1.0
CARD_PLAIN = 1.0                 # 지시서는 0.5. 10/5 민찬 결정으로 같게

REASON_WEIGHTS = {"topic": 1.0, "method": 0.7, "new_field": 0.5, "experience": 0.3}
QUIZ_BONUS = 1.2
MIN_LATENCY_MS = 5000
QUICK_GAP_S = 30                 # 직전 응답과 이 초 안이면 할인(임시값, 리허설에서 다시)
QUICK_DISCOUNT = 0.5
MIN_RESPONSES = 2
POSTER_BETA = 0.2                # 포스터 옮기는 폭. 만족도(0.5)보다 작게


def card_matrix(rows: list[dict], idx: dict[str, int]) -> tuple[np.ndarray, dict, dict[tuple[int, int], float]]:
    """명함 교환 원본 행 → 대칭 가중 행렬 W, 집계, 쌍마다 처음 교환한 시각(초, 모르면 0).
    한 쌍에 행이 여러 개(양방향 2행)여도 한 간선이다. 확인된 교환은 모두 1.0(CARD_FIRST_MEET = CARD_PLAIN).
    그 쌍의 행이 전부 확인 대기(status=pending)면 뺀다."""
    n = len(idx)
    pairs: dict[tuple[int, int], dict] = {}
    for r in rows:
        a, b = r.get("scanner_id"), r.get("scanned_id")
        if a not in idx or b not in idx or a == b:
            continue
        key = tuple(sorted((idx[a], idx[b])))
        p = pairs.setdefault(key, {"first": False, "confirmed": False, "at": None})
        if r.get("created_at") is not None:
            t = _ts(r["created_at"])
            p["at"] = t if p["at"] is None else min(p["at"], t)
        p["first"] |= bool(r.get("first_meet"))
        p["confirmed"] |= (r.get("status") or "confirmed") != "pending"
    W = np.zeros((n, n))
    at: dict[tuple[int, int], float] = {}
    kept = first = 0
    for (i, j), p in pairs.items():
        if not p["confirmed"]:
            continue
        W[i, j] = W[j, i] = CARD_FIRST_MEET if p["first"] else CARD_PLAIN
        at[(i, j)] = p["at"] if p["at"] is not None else 0.0
        kept += 1
        first += p["first"]
    return W, {"pairs": kept, "first_meet": int(first), "pending": len(pairs) - kept}, at


def _ts(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


def poster_signal(rows: list[dict], idx: dict[str, int], posters: dict[int, dict],
                  affiliation: dict[str, str | None]) -> tuple[list[tuple[int, int, float]], dict]:
    """포스터 응답 → [(사람 번호, 포스터 id, 가중치)] 와 버린 이유별 집계.
    rows = poster_responses 행, posters = {id: {presenter_ids, ...}}, affiliation = {참가자 id: 소속}."""
    stat = {"rows": len(rows), "fast": 0, "presenter": 0, "same_affiliation": 0, "quick": 0, "too_few_people": 0}
    by_person: dict[str, list[dict]] = {}
    for r in rows:
        if r["participant_id"] in idx:
            by_person.setdefault(r["participant_id"], []).append(r)
    out: list[tuple[int, int, float]] = []
    for pid, rs in by_person.items():
        rs = sorted(rs, key=lambda r: _ts(r.get("created_at") or 0))
        times = [_ts(r.get("created_at") or 0) for r in rs]
        # 직전 응답(버린 응답 포함 — 그 자리에 있었던 시각이라)과 30초 안이면 빠른 연속
        quick = {k for k in range(1, len(rs)) if times[k] - times[k - 1] < QUICK_GAP_S}
        mine: list[tuple[int, int, float]] = []
        for k, r in enumerate(rs):
            lat = r.get("latency_ms")
            if lat is not None and lat < MIN_LATENCY_MS:
                stat["fast"] += 1
                continue
            p = posters.get(r["poster_id"]) or {}
            pres = p.get("presenter_ids") or []
            if pid in pres:
                stat["presenter"] += 1
                continue
            aff = affiliation.get(pid)
            if aff and any(affiliation.get(x) == aff for x in pres):
                stat["same_affiliation"] += 1
                continue
            w = REASON_WEIGHTS.get(r.get("reason"), 0.0)
            w *= QUIZ_BONUS if r.get("quiz_attempted") else 1.0
            if k in quick:
                w *= QUICK_DISCOUNT
                stat["quick"] += 1
            if w > 0:
                mine.append((idx[pid], r["poster_id"], w))
        if len(mine) < MIN_RESPONSES:
            stat["too_few_people"] += 1 if mine else 0
            continue
        out.extend(mine)
    stat["used"] = len(out)
    stat["people"] = len({i for i, _, _ in out})
    return out, stat
