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
        # a: 흥미 3단계 그대로(5분 간격). 퀴즈는 반영 안 함(10/6), 관심 분야 아님은 음수로 남김
        _resp("a", 2, "want", 1, 0), _resp("a", 3, "maybe", 2, 300), _resp("a", 4, "not_mine", 3, 600, quiz=True),
        # b: 1번 포스터 발표자(d)와 같은 소속 → 뺌. 남은 1건뿐이라 b 는 반영 안 함
        _resp("b", 1, "want", 1, 0), _resp("b", 2, "want", 2, 400),
        # c: 너무 빠른 응답 1건(버림) + 직전과 30초 안 3건(각각 × 0.5. 버린 응답 시각도 직전으로 침)
        _resp("c", 2, "want", 1, 0, lat=3000), _resp("c", 3, "want", 2, 10), _resp("c", 4, "maybe", 3, 30),
        _resp("c", 1, "want", 4, 50),
        # e: 처음 응답은 그대로, 20초 뒤 응답만 × 0.5, 그다음은 2분 뒤라 그대로
        _resp("e", 2, "want", 1, 0), _resp("e", 3, "want", 2, 20), _resp("e", 4, "want", 3, 140),
        # d: 자기 포스터 → 뺌
        _resp("d", 1, "want", 1, 0),
    ]
    out, st = signals.poster_signal(rows, {**IDX, "e": 4}, posters, aff)
    got = {(i, p): round(w, 4) for i, p, w in out}
    assert got[(0, 2)] == 1.0 and got[(0, 3)] == 0.33 and got[(0, 4)] == -0.2     # 퀴즈 풀었어도 × 1.2 없음
    assert not any(i == 1 for i, _, _ in out)                       # b 는 남은 응답 1건
    assert got[(2, 3)] == 0.5 and got[(2, 4)] == 0.165 and got[(2, 1)] == 0.5   # c: 빠른 연속 × 0.5
    assert got[(4, 2)] == 1.0 and got[(4, 3)] == 0.5 and got[(4, 4)] == 1.0      # e: 20초 뒤 응답만
    assert not any(i == 3 for i, _, _ in out)
    assert st["fast"] == 1 and st["presenter"] == 1 and st["same_affiliation"] == 1 and st["quick"] == 4
    # 예전 관심 이유 키(topic 등)는 무게가 없어 쓰지 않는다
    old, _ = signals.poster_signal([_resp("a", 2, "topic", 1, 0), _resp("a", 3, "topic", 2, 300)], IDX, posters, aff)
    assert old == []


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


def test_query_targets_and_apply():
    from pipeline import search
    from pipeline.embed import unit
    now = 10_000.0
    L = lambda pid, kind, t, **pl: {"participant_id": pid, "kind": kind, "created_at": t, "payload": pl}
    logs = [
        # a: '추천' → 20초 뒤 열어 봄(b) → 40초 뒤 '추천 시스템'으로 고쳐 침. 열어 봄은 묶음에 붙어 사라지지 않는다
        L("a", "keyword_search", now - 600, q="추천", hits=3), L("a", "keyword_open", now - 580, q="추천", target_id="b"),
        L("a", "keyword_search", now - 560, q="추천 시스템", hits=2),
        # c: 40분 전 '금융' → 폭 절반. '오타' 는 결과 0명이라 안 씀
        L("c", "keyword_search", now - 40 * 60, q="금융", hits=2), L("c", "keyword_search", now - 10 * 60, q="굼융", hits=0),
        # d: 같은 'LLM' 두 번(5분 간격) 뒤 한 번 열어 봄 → 열어 봄은 직전 검색에만 한 번. 열어 본 뒤 교환 → 0.3
        L("d", "keyword_search", now - 600, q="LLM", hits=2), L("d", "keyword_search", now - 300, q="LLM", hits=2),
        L("d", "keyword_open", now - 200, q="LLM", target_id="a"),
        # b: 이미 교환한 사람(교환이 열어 보기 전)을 다시 열어 봄 → 0.2
        L("b", "keyword_search", now - 100, q="커머스", hits=1), L("b", "keyword_open", now - 90, q="커머스", target_id="c"),
    ]
    at = {(0, 3): now - 150, (1, 2): now - 5000}
    items, st = search.query_targets(logs, IDX, at, now)
    got = sorted(((it["i"], it.get("target"), it.get("text"), round(it["beta"], 4)) for it in items), key=repr)
    dec = lambda age: 0.5 ** (age / 60 / 40)
    assert got == sorted([(0, 1, None, round(0.2 * dec(560), 4)), (2, None, "금융", 0.05),
                          (3, 0, None, round(0.3 * dec(300), 4)), (1, 2, None, round(0.2 * dec(100), 4)),
                          (3, None, "LLM", round(0.1 * dec(600), 4))], key=repr), got     # 5분 전 첫 'LLM' 은 따로 센 검색(열어 봄 없음)
    assert st["chained"] == 1 and st["zero_hit"] == 1 and st["opened"] == 2 and st["opened_exchanged"] == 1
    # 행사 직후 추천(decay_on=False): 몇 시간 뒤에 돌려도 그날 검색이 같은 무게
    later, _ = search.query_targets(logs, IDX, at, now + 5 * 3600, decay_on=False)
    assert sorted(round(it["beta"], 4) for it in later) == sorted([0.2, 0.1, 0.3, 0.2, 0.1])
    # 적용: 목표를 지나치지 않고, 행사 전 Seek 와 cos 0.85 아래로 안 감
    S = unit(np.array([[1.0, 0, 0, 0], [0, 1.0, 0, 0]]))
    O = unit(np.array([[0, 0, 1.0, 0], [0.99, 0.14, 0, 0]]))
    Z = search.apply_queries(S, [{"i": 0, "target": 1, "beta": 0.3}], O, lambda t: np.ones((len(t), 4)))
    assert Z[0] @ O[1] >= S[0] @ O[1] - 1e-9 and Z[0] @ O[1] > 0.999            # 거의 같은 방향 목표는 그 자리에서 멈춤
    far = search.apply_queries(S, [{"i": 0, "target": 0, "beta": 3.0}], O, lambda t: np.ones((len(t), 4)), S_ref=S)
    assert far[0] @ S[0] >= search.MIN_COS_TO_BEFORE - 1e-9
    assert np.allclose(Z[1], S[1])                                              # 다른 사람은 그대로
    r = search.semantic_rank(np.array([1.0, 0, 0, 0]), np.eye(4), ["a", "b", "c", "d"], {"b"})
    assert r == [("a", 1.0)]


def test_search_items_and_query_text():
    from pipeline import search
    assert search.search_items("LLM 을 만든다. 비전도 한다", ["llm", " ", "컴퓨터비전"]) == \
        ["LLM 을 만든다.", "비전도 한다", "관심 주제: llm", "관심 주제: 컴퓨터비전"]     # 태그는 하나씩, 빈 태그는 뺌
    assert search.query_text("언어모델", ["LLM", "언어모델", "llm", " ", "대규모 언어 모델"]) == "언어모델 (LLM, 대규모 언어 모델)"
    assert search.query_text("금융", []) == "금융"
    # 사람별 최고: 0번 사람 항목 2개(0.2, 0.9), 1번 사람 항목 1개(0.5)
    assert np.allclose(search.person_max(np.array([0.2, 0.9, 0.5]), np.array([0, 0, 1]), 3), [0.9, 0.5, -1.0])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
