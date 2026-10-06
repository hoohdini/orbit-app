"""반영 신호 정리(B-05) · 근거 문장 · 라벨(B-07 · B-08) 단위 시험. 모델 없이 돈다.

실행  cd services/compute && python tests/test_signals.py
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pipeline import evidence, signals  # noqa: E402

IDX = {"a": 0, "b": 1, "c": 2, "d": 3}


def test_card_matrix_weights():
    rows = [
        {"scanner_id": "a", "scanned_id": "b"}, {"scanner_id": "b", "scanned_id": "a"},          # 칸 없음 → 1.0
        {"scanner_id": "a", "scanned_id": "c", "first_meet": True, "status": "confirmed"},       # 첫 대화 → 1.0
        {"scanner_id": "c", "scanned_id": "a", "first_meet": False, "status": "confirmed"},
        {"scanner_id": "b", "scanned_id": "d", "status": "pending"},                              # 확인 대기 → 뺌
        {"scanner_id": "a", "scanned_id": "x"},                                                   # 다른 행사 사람 → 뺌
    ]
    W, st, at = signals.card_matrix(rows, IDX)
    assert W[0, 1] == W[1, 0] == 1.0 and W[0, 2] == W[2, 0] == 1.0 and W[1, 3] == 0      # 체크 여부와 상관없이 1.0
    assert st == {"pairs": 2, "first_meet": 1, "pending": 1}


def _resp(pid, poster, reason, seq, t, lat=20000, quiz=False):
    return {"participant_id": pid, "poster_id": poster, "reason": reason, "seq_no": seq,
            "latency_ms": lat, "quiz_attempted": quiz, "created_at": t}


def test_poster_signal_rules():
    posters = {1: {"presenter_ids": ["d"]}, 2: {"presenter_ids": []}, 3: {"presenter_ids": []}, 4: {"presenter_ids": []}}
    aff = {"a": "연세대", "b": "카카오", "c": None, "d": "카카오"}
    rows = [
        # a: 3건 모두 그대로(미션 할인 없음, 5분 간격), 3건째는 퀴즈 × 1.2
        _resp("a", 2, "topic", 1, 0), _resp("a", 3, "method", 2, 300), _resp("a", 4, "experience", 3, 600, quiz=True),
        # b: 1번 포스터 발표자(d)와 같은 소속 → 뺌. 남은 1건뿐이라 b 는 반영 안 함
        _resp("b", 1, "topic", 1, 0), _resp("b", 2, "topic", 2, 400),
        # c: 너무 빠른 응답 1건(버림) + 직전과 30초 안 3건(각각 × 0.5. 버린 응답 시각도 직전으로 침)
        _resp("c", 2, "topic", 1, 0, lat=3000), _resp("c", 3, "topic", 2, 10), _resp("c", 4, "new_field", 3, 30),
        _resp("c", 1, "topic", 4, 50),
        # e: 처음 응답은 그대로, 20초 뒤 응답만 × 0.5, 그다음은 2분 뒤라 그대로
        _resp("e", 2, "topic", 1, 0), _resp("e", 3, "topic", 2, 20), _resp("e", 4, "topic", 3, 140),
        # d: 자기 포스터 → 뺌
        _resp("d", 1, "topic", 1, 0),
    ]
    out, st = signals.poster_signal(rows, {**IDX, "e": 4}, posters, aff)
    got = {(i, p): round(w, 4) for i, p, w in out}
    assert got[(0, 2)] == 1.0 and got[(0, 3)] == 0.7 and got[(0, 4)] == round(0.3 * 1.2, 4)
    assert not any(i == 1 for i, _, _ in out)                       # b 는 남은 응답 1건
    assert got[(2, 3)] == 0.5 and got[(2, 4)] == 0.25 and got[(2, 1)] == 0.5   # c: 빠른 연속 × 0.5
    assert got[(4, 2)] == 1.0 and got[(4, 3)] == 0.5 and got[(4, 4)] == 1.0      # e: 20초 뒤 응답만
    assert not any(i == 3 for i, _, _ in out)
    assert st["fast"] == 1 and st["presenter"] == 1 and st["same_affiliation"] == 1 and st["quick"] == 4


def test_sentences_and_label():
    # 사람 0 은 '추천 현업자' 를 찾고, 사람 1 은 '추천 모델 운영' 을 한다 → 0 이 1 을 볼 때 seek_offer
    def enc(sents):
        vocab = ["추천", "금융", "시계열", "현업자", "운영"]
        X = np.array([[1.0 if w in s else 0.0 for w in vocab] for s in sents]) + 1e-3
        return X
    offers = ["시계열 공부를 한다", "추천 모델 운영을 한다", "금융 데이터를 본다"]
    seeks = ["추천 현업자를 찾는다", "", ""]
    oi, ov = evidence.item_vectors(enc, offers)
    si_, sv = evidence.item_vectors(enc, seeks)
    sim, si, oj = evidence.best_match(sv, ov)
    thr = evidence.threshold(sim)
    tags = [["금융"], ["추천"], ["금융"]]
    ev = evidence.sentences([(0, 1), (1, 0), (0, 2), (2, 1)], ["가", "나", "다"], si_, oi, sim, si, oj, thr, tags)
    assert ev[(0, 1)] == ("seek_offer", "나님 '추천 모델 운영을 한다' · 가님이 찾는 것 '추천 현업자를 찾는다'")
    assert ev[(1, 0)][0] == "offer_seek"                              # 반대 방향
    assert ev[(0, 2)] == ("common_tags", "두 분 모두 금융에 관심이 있어요")
    assert (2, 1) not in ev                                           # 근거 없으면 비움
    labels = {0: "추천 계열", 1: "금융 계열"}
    assert evidence.group_label([0, 1, 2], [0, 0, 1], labels, tags) == (0, "추천 계열")
    assert evidence.group_label([0, 2], [0, 0, 1], labels, tags) == (None, "금융")   # 0 과 1 동률 → 공통 태그
    assert evidence.group_label([0, 1], [0, 1], labels, [["x"], ["y"]]) == (None, None)


def test_affiliation_and_teams():
    from pipeline import people
    assert people.norm_affiliation("연세대학교 응용통계학과") == people.norm_affiliation("연세대 응용통계") == "연세대응용통계"
    assert people.norm_affiliation("연세대학교 산업공학과") == people.norm_affiliation("연세대 산업공학")
    assert people.norm_affiliation("경영학부") == people.norm_affiliation("경영학") != people.norm_affiliation("경제학")
    assert people.norm_affiliation("연세대") == people.norm_affiliation("연세대학교") != people.norm_affiliation("고려대")
    assert people.norm_affiliation("ＫＡＫＡＯ (판교)") == people.norm_affiliation("kakao 판교")
    P = [{"cohort": 14, "affiliation": "연세대학교 산업공학과", "teams": []},
         {"cohort": 14, "affiliation": "연세대 산업공학", "teams": ["25-2 추천"]},
         {"cohort": 13, "affiliation": "카카오", "teams": ["25-2  추천", "26-1 LLM"]},
         {"cohort": None, "affiliation": "카카오", "teams": []}]
    M = people.acquainted(P)
    assert M[0, 1] and M[1, 2] and not M[0, 2] and not M[2, 3] and not M.diagonal().any()   # 같은 기수 · 같은 소속 / 같은 팀(띄어쓰기 달라도)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
