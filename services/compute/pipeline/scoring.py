"""쌍 점수. 벡터로 계산하고 주소는 쓰지 않는다(접두사로 후보를 줄이면 recall 0.042 → 0.020).

a[i, j] = cos(seek_i, offer_j)   i 가 j 에게서 얻는 것 (한 방향)

쓰는 곳 (연구 저장소 docs/33 G16c · 노션 9/23 1-1)
  개인 추천 목록     REC_SCORE 로 고른다. 기본 rule(10/18, rec_rule_score): 찾는 사람 → 하는 일 · 하는 일끼리 · '줄 수 있는 것' 규칙을
                     1 : 1 : 2 로 섞은 한 방향 점수. 예전 방식은 min (양방향 작은 쪽) · one_way (a 그대로) · avg · harmonic
                     예전 근거 — 공동저술 사람별 a 0.713 · min 0.694, 스피드데이팅 min 0.538 · a 0.528
  테이블 배정       두 사람이 같이 앉으므로 두 방향을 합친다. min · 평균 · 조화평균 중 무엇이 나은지는 리허설에서 정한다
                     세 값을 pair_scores 에 같이 남긴다(score_ab, score_ba)
  호스트            want 가 없다. 학생 ↔ 호스트 쌍은 학생 쪽 한 방향만 쓴다. 호스트끼리는 0
"""
from __future__ import annotations

import os
import re

import numpy as np

from .embed import unit


def fill_blank_seek(S: np.ndarray, O: np.ndarray, blank: np.ndarray) -> np.ndarray:
    """Seek 를 안 쓴 사람은 자기 Offer 로 대신한다(성하 06_event_loop 와 같은 1차 대체)."""
    S = S.copy()
    S[blank] = O[blank]
    return S


def directional(S: np.ndarray, O: np.ndarray) -> np.ndarray:
    """a[i, j] = cos(seek_i, offer_j). 자기 자신은 0."""
    a = unit(S) @ unit(O).T
    np.fill_diagonal(a, 0.0)
    return a


def _z(x: np.ndarray) -> np.ndarray:
    """대각선을 뺀 값으로 표준화. 대각선은 0."""
    off = ~np.eye(len(x), dtype=bool)
    sd = x[off].std()
    z = (x - x[off].mean()) / (sd if sd > 0 else 1.0)
    np.fill_diagonal(z, 0.0)
    return z


def pair_directional(S: np.ndarray, O: np.ndarray, center: bool = False, topic_weight: float = 0.0) -> np.ndarray:
    """directional 의 보정판(10/17 좌석 비교 평가, sim/eval_seating.py).
    center: 참가자 평균 벡터를 빼고 다시 정규화한다. e5 코사인은 0.88~0.94 에 몰려 사람 차이가 묻힌다.
    topic_weight: 하는 일끼리의 유사도(같은 분야)를 그 비율만큼 섞는다. 두 점수를 표준화한 뒤 섞으므로 값은 cos 가 아니다."""
    if center:
        S, O = unit(S - S.mean(0)), unit(O - O.mean(0))
    a = directional(S, O)
    if topic_weight <= 0:
        return a
    t = directional(O, O)
    return (1 - topic_weight) * _z(a) + topic_weight * _z(t)


def seat_directional(S: np.ndarray, O: np.ndarray) -> np.ndarray:
    """테이블토크 · 커피챗 배정에 쓰는 한 방향 점수. 환경변수 SEAT_CENTER(기본 1) · SEAT_TOPIC_WEIGHT(기본 0.5).
    가상 80명 비교 평가(시험 시드 5개)에서 행사 전체 좋은 만남 수 1.78 → 2.70(무작위 1.75). 예전 방식은 SEAT_CENTER=0 SEAT_TOPIC_WEIGHT=0.
    개인 추천 · pair_scores 원본 · 근거 한 줄은 그대로 directional 을 쓴다."""
    center = os.environ.get("SEAT_CENTER", "1").strip() not in ("0", "false", "")
    w = float(os.environ.get("SEAT_TOPIC_WEIGHT", "0.5") or 0)
    return pair_directional(S, O, center, w)


def combine(a: np.ndarray, mode: str = "min") -> np.ndarray:
    """두 방향 결합. mode: min | avg | harmonic."""
    b = a.T
    if mode == "min":
        c = np.minimum(a, b)
    elif mode == "avg":
        c = (a + b) / 2
    elif mode == "harmonic":                    # 상호 추천 분야의 대표 결합 (RECON, Pizzato 외 2010)
        x, y = np.clip(a, 1e-6, None), np.clip(b, 1e-6, None)
        c = 2 * x * y / (x + y)
    else:
        raise ValueError(f"모르는 결합 방식 {mode}")
    np.fill_diagonal(c, 0.0)
    return c


# '줄 수 있는 것' 규칙(10/18 민찬, sim/eval_recs_rule.py). 내가 고른 '기대하는 점' → 그걸 줄 수 있는 상대 구분과 정도(1 = 충분히).
# 상대 구분은 여러 개일 수 있다(participants.careers, 0017: 폼 '해당하는 경험' 기업 재직 · 기업 인턴 · 학부연구생 · 대학원 + 재학생 · 교수). 가장 높은 값을 쓴다
# 키는 사전 등록 구글폼(10/18 성하)의 '게더링에 기대하는 점 · 현재 관심사' 선택지 그대로 = profiles.intent_tags. 괄호 설명 · 띄어쓰기는 무시.
# 폼 선택지가 바뀌면 여기를 같이 고친다(모르는 선택지는 계산 기록 params.intent_unknown 에 남는다)
SAME = "same"                         # 상대도 같은 선택지를 골랐으면 1(줄 사람이 구분이 아니라 관심으로 정해지는 것)
WANTS = {
    "커리어 조언·현업 이야기": {"employed": 1.0, "intern": 0.5},   # 기업 인턴은 재직자보다 한 단계 낮게(민찬, 학부연구생과 같은 0.5)
    "취업·이직 정보": {"employed": 1.0, "intern": 0.5},
    "대학원 진학·연구": {"grad": 1.0, "professor": 1.0, "lab_intern": 0.5},     # 학부연구생은 대학원생보다 한 단계 낮게(민찬)
    "스터디·프로젝트 팀원 찾기": {"student": 1.0, "lab_intern": 1.0},
    "최신 AI·데이터 트렌드": {"employed": 0.5, "grad": 0.5},
    "창업·사이드 프로젝트": SAME,      # 학생이어도 관심 없을 수 있어, 같은 선택지를 고른 사람끼리(민찬)
}
NO_RULE = ("비슷한 분야 사람 만나기", "다른 기수와의 교류")   # 규칙 없음. 분야 점수(하는 일끼리)가 맡음
REC_RULE_WEIGHTS = (0.25, 0.25, 0.5)  # 찾는 사람 → 하는 일, 하는 일끼리(분야), 규칙. 표준화한 뒤 섞는다


def _intent_key(x: str) -> str:
    """폼 선택지 → 규칙표 키. 괄호 설명과 띄어쓰기를 빼고 가운뎃점 변형(ㆍ ・ ‧ ∙ •)을 · 로. 예: '취업ㆍ이직 정보(현업)' → '취업·이직정보'."""
    return re.sub(r"[ㆍ・‧∙•]", "·", re.sub(r"\(.*?\)|\s", "", x or ""))


_WANTS = {_intent_key(k): v for k, v in WANTS.items()}


def _career_set(c) -> set[str]:
    """구분 하나(career, 0015) · 여러 개(careers, 0017) · 모름(None)을 모두 집합으로."""
    return {c} if isinstance(c, str) else set(c or [])


def gives_matrix(intents: list[list[str]], careers: list) -> np.ndarray:
    """g[i, j] = i 가 고른 기대하는 점 중 규칙이 있는 것마다 j 가 줄 수 있는 정도를 더해 그 개수로 나눈 것(0~1). 한 방향.
    구분 규칙은 j 의 구분 중 가장 높은 값(모르면 0). 경험이 여럿이어도 같은 정보를 두 배로 줄 수는 없어 더하지 않는다.
    SAME 규칙은 j 도 같은 선택지를 골랐는지. 규칙 없는 선택지(NO_RULE · 기타)는 세지 않는다.
    careers[j] 는 구분 하나(str) · 여러 개(list) · None 모두 받는다."""
    n = len(intents)
    g = np.zeros((n, n))
    mine = [{_intent_key(x) for x in (w or [])} for w in intents]
    cs = [_career_set(c) for c in careers]
    for i in range(n):
        w = [x for x in mine[i] if x in _WANTS]
        if not w:
            continue
        for j in range(n):
            if i == j:
                continue
            s = 0.0
            for x in w:
                rule = _WANTS[x]
                s += (1.0 if x in mine[j] else 0.0) if rule == SAME else max((rule.get(c, 0.0) for c in cs[j]), default=0.0)
            g[i, j] = s / len(w)
    return g


def rec_rule_score(S: np.ndarray, O: np.ndarray, intents: list[list[str]], careers: list,
                   weights: tuple[float, float, float] = REC_RULE_WEIGHTS) -> np.ndarray:
    """개인 추천용 한 방향 점수(10/18). 세 점수를 표준화(_z)해 weights 로 섞는다. 값은 cos 가 아니다.
    1) 찾는 사람 → 하는 일 cos(평균 뺀 벡터) 2) 하는 일끼리 cos(같은 분야, 평균 뺀 벡터) 3) gives_matrix.
    문장 비교 모델은 '재직자 → 취업 · 이직 정보' 같은 연결을 잡지 못해(가상 데이터 상관 0.04~0.15) 규칙으로 직접 넣는다.
    가상 80명(시드 20개, 서비스 추천 함수 그대로, sim/eval_recs_rule.py, 폼처럼 찾는 사람 빈칸)에서 10명 중 좋은 상대 2.79(예전 min) → 3.47.
    규칙 재료가 없으면(구분을 모르거나 아무도 규칙 있는 선택지를 안 고름) service._rec_scores 가 예전 min 으로 돌아간다(1 · 2 만 남은 조합은 평가하지 않았으므로)."""
    Sc, Oc = unit(S - S.mean(0)), unit(O - O.mean(0))
    g = gives_matrix(intents, careers)
    parts = [_z(directional(Sc, Oc)), _z(directional(Oc, Oc)), _z(g) if g.std() > 0 else np.zeros_like(g)]
    r = sum(w * x for w, x in zip(weights, parts))
    np.fill_diagonal(r, 0.0)
    return r


def intent_unknown(intents: list[list[str]]) -> list[str]:
    """규칙표(WANTS · NO_RULE)에 없는 기대하는 점(폼 선택지와 표의 말이 어긋났는지 · 기타 답을 보려고 계산 기록에 남긴다)."""
    known = set(_WANTS) | {_intent_key(x) for x in NO_RULE}
    return sorted({t for w in intents for t in (w or []) if _intent_key(t) not in known})


def rec_matrix(a: np.ndarray, mode: str | None = None) -> np.ndarray:
    """개인 추천용 점수(예전 방식). mode: min | avg | harmonic | one_way. 기본 rule 은 service._rec_scores 가 rec_rule_score 로 따로 만든다."""
    mode = mode or os.environ.get("REC_SCORE", "min")
    if mode == "rule":
        mode = "min"
    if mode == "one_way":
        r = a.copy()
        np.fill_diagonal(r, 0.0)
        return r
    return combine(a, mode)


def table_matrix(a: np.ndarray, is_host: np.ndarray, mode: str = "min") -> np.ndarray:
    """테이블 배정용 대칭 점수. 호스트가 낀 쌍은 호스트가 아닌 쪽의 한 방향만."""
    A = combine(a, mode)
    h = is_host.astype(bool)
    student_to_host = a[np.ix_(~h, h)]              # 학생이 호스트에게서 얻는 것
    A[np.ix_(~h, h)] = student_to_host
    A[np.ix_(h, ~h)] = student_to_host.T
    A[np.ix_(h, h)] = 0.0
    np.fill_diagonal(A, 0.0)
    return A


# 테이블토크 만족도 답 → 만남 반영 세기. 질문 하나에 답마다 가중치(9/27 회의: 백엔드가 정함, 9/29 민찬 결정 C안).
# 10/9 부터 "배정은 어땠나요?" 따봉 3단계: 최고였어요(gained) 1 · 좋았어요(different) 0.33 · 별로였어요(mismatch) −0.2. 키는 그대로 두었다
# 근거(연구 저장소 docs/34)
#   좋았어요 0.33 — 3단계 등급을 지수 gain(2^r − 1)으로 바꿔 최고값 1 로 나눈 값 0 · 0.33 · 1 (Burges 외 2005).
#                        등급 간격은 본래 임의라는 지적(Järvelin & Kekäläinen 2002)이 있어 리허설에서 다시 본다
#   잘 모르겠다 0      — 예전 답. 더 받지 않는다(부정으로 읽혀 안 맞았다와 겹친다는 팀 피드백, '모름' 칸이 대충 답하기를 부추긴다 — Krosnick 외 2002)
#   별로였어요 −0.2 — Rocchio 관련성 피드백의 부정/긍정 비율 γ/β = 0.15/0.75 (Manning 외 2008). 부정을 아예 안 쓰면
#                      성능이 떨어졌다(Salton & Buckley 1990). 테이블 평균이라 방향이 흐려 보수적인 0.2 쪽을 씀
# 정확한 값은 문헌으로 못 정한다. 리허설 답 분포와 추천 변화를 보고 다시 정한다
SAT_WEIGHTS_DEFAULT = {"gained": 1.0, "different": 0.33, "unsure": 0.0, "mismatch": -0.2}


def sat_weights(raw: str | None = None) -> dict[str, float]:
    """환경변수 SAT_WEIGHTS 예: 'gained=1,different=0.33,unsure=0,mismatch=-0.2'. 빠진 답은 기본값."""
    w = dict(SAT_WEIGHTS_DEFAULT)
    for part in (raw if raw is not None else os.environ.get("SAT_WEIGHTS", "")).split(","):
        k, _, v = part.partition("=")
        if k.strip() in w and v.strip():
            w[k.strip()] = float(v)
    return w


def seek_toward(S: np.ndarray, T: np.ndarray, w: np.ndarray, beta: float = 0.5) -> np.ndarray:
    """i 의 Seek 를 목표 벡터 T[i] 쪽으로 beta × w[i] 만큼 옮긴다. w 가 음수면 반대로 밀어낸다(Rocchio 의 부정 피드백).
    G★ 직교 주입과 같은 방식(내 방향과 직교하는 성분만)이라 원래 찾던 것은 유지된다. w 가 0 이거나 T[i] 가 0 이면 그대로 둔다.
    beta 0.5 는 구인구직 자료에서 최적이었다(Beauty 는 1.0). 주소는 바꾸지 않고 점수용 벡터만 바꾼다."""
    S = unit(S)
    Z = S.copy()
    for i in np.nonzero(w)[0]:
        r = T[i] - (T[i] @ S[i]) * S[i]
        nr = np.linalg.norm(r)
        if nr > 1e-12:
            Z[i] = S[i] + beta * w[i] * r / nr
    return unit(Z)


def seek_shift(S: np.ndarray, O: np.ndarray, mates: list[list[int]], w: np.ndarray, beta: float = 0.5) -> np.ndarray:
    """만족도 반영. i 가 테이블토크에서 얻은 게 있었다면 i 의 Seek 를 그 테이블 사람들의 Offer 평균 쪽으로 옮긴다.
    → 커피챗 추천에서 i 에게 그 사람들과 비슷한 새 사람이 더 올라온다. 옮기는 폭 = beta × w[i] (답별 가중치).
    안 맞았다(w < 0)면 그 쪽에서 조금 밀어낸다."""
    T = np.array([O[ms].mean(0) if ms else np.zeros(O.shape[1]) for ms in mates])
    return seek_toward(S, T, np.array([w[i] if mates[i] else 0.0 for i in range(len(mates))]), beta)


def card_shift(S: np.ndarray, O: np.ndarray, W: np.ndarray, beta: float = 0.5, by_weight: bool = False) -> np.ndarray:
    """명함 교환 반영. W[i, j] = i 와 j 사이 명함 간선 가중치(대칭). i 의 Seek 를 명함을 교환한 사람들의 Offer
    가중 평균 쪽으로 beta 만큼 옮긴다 → 커피챗 추천에서 i 에게 그 사람들과 비슷한 새 사람이 더 올라온다.
    9/29 민찬 결정: 예전엔 i 의 Offer 를 옮겼다(1차 G★ 를 그대로 옮긴 모양). 그러면 명함 한 장으로 i 의 소개가 바뀌고
    i 자신의 추천은 거의 안 바뀐다. 명함 교환은 i 가 무엇에 관심 있는지를 더 잘 보여 주므로 만족도 · 포스터처럼 Seek 쪽에 넣는다.
    간선이 없는 사람은 그대로 둔다. by_weight=True 면 옮기는 폭을 그 사람의 가장 큰 간선 가중치로 정한다
    (지금은 확인된 교환이 모두 1.0 이라 결과는 같다. 가중치를 다시 나누면 쓰려고 남겨 둠)."""
    deg = W.sum(1)
    T = np.where(deg[:, None] > 0, W @ unit(O) / np.maximum(deg, 1e-12)[:, None], 0.0)
    w = W.max(1) if by_weight else (deg > 0).astype(float)
    return seek_toward(S, T, w, beta)


# 포스터 관심도 답 → 추천 방향. 관심 있게 본 포스터의 주제 쪽으로 Seek 를 옮긴다(9/28 민찬 결정). 값은 임시, 리허설 뒤 정함
# 9/29 민찬 결정 — 테이블 만족도(C안)와 같은 규칙: 중간 0.33 은 지수 gain, 관심 분야 아님 −0.2 는 Rocchio 부정 비율.
# 포스터는 주제 하나라 방향이 뚜렷해서 Rocchio 의 문서 한 건 부정 판정과 구조가 같다
POSTER_WEIGHTS_DEFAULT = {"learn_more": 1.0, "interesting": 0.33, "not_mine": -0.2}


def poster_weights(raw: str | None = None) -> dict[str, float]:
    """환경변수 POSTER_WEIGHTS 예: 'learn_more=1,interesting=0.33,not_mine=-0.2'. 빠진 답은 기본값."""
    w = dict(POSTER_WEIGHTS_DEFAULT)
    for part in (raw if raw is not None else os.environ.get("POSTER_WEIGHTS", "")).split(","):
        k, _, v = part.partition("=")
        if k.strip() in w and v.strip():
            w[k.strip()] = float(v)
    return w


def poster_targets(n: int, interest: list[tuple[int, int, float]], V: dict[int, np.ndarray], dim: int,
                   negative: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """interest = [(사람, 포스터, 가중치)], V = 포스터 벡터. negative=False 면 양수 답만(당김), True 면 음수 답만(밀어냄).
    사람마다 목표 = 절댓값으로 가중 평균한 포스터 벡터, 폭 = 절댓값이 가장 큰 가중치(부호 포함). 당김 · 밀어냄을 따로 한 번씩 적용한다.
    예: 더 알아보고 싶다(1.0) 1개 + 흥미로웠다(0.33) 1개 → 목표는 두 포스터를 1 : 0.33 으로 섞은 것, 폭 1.0"""
    T, s, w = np.zeros((n, dim)), np.zeros(n), np.zeros(n)
    for i, p, wt in interest:
        if wt == 0 or p not in V or (wt < 0) != negative:
            continue
        T[i] += abs(wt) * V[p]
        s[i] += abs(wt)
        if abs(wt) > abs(w[i]):
            w[i] = wt
    T[s > 0] /= s[s > 0, None]
    return T, w
