"""쌍 점수. 벡터로 계산하고 주소는 쓰지 않는다(접두사로 후보를 줄이면 recall 0.042 → 0.020).

a[i, j] = cos(seek_i, offer_j)   i 가 j 에게서 얻는 것 (한 방향)

쓰는 곳 (연구 저장소 docs/33 G16c · 노션 9/23 1-1)
  개인 추천 목록     REC_SCORE 로 고른다. 기본 min (처음 합의). one_way 는 a 그대로
                     근거가 갈림 — 공동저술 사람별 a 0.713 · min 0.694, 스피드데이팅 min 0.538 · a 0.528
                     리허설에서 두 점수를 비교해 본행사 전에 정한다
  테이블 배정       두 사람이 같이 앉으므로 두 방향을 합친다. min · 평균 · 조화평균 중 무엇이 나은지는 리허설에서 정한다
                     세 값을 pair_scores 에 같이 남긴다(score_ab, score_ba)
  호스트            want 가 없다. 학생 ↔ 호스트 쌍은 학생 쪽 한 방향만 쓴다. 호스트끼리는 0
"""
from __future__ import annotations

import os

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


def rec_matrix(a: np.ndarray, mode: str | None = None) -> np.ndarray:
    """개인 추천용 점수. mode: min | avg | harmonic | one_way (기본은 환경변수 REC_SCORE, 없으면 min)."""
    mode = mode or os.environ.get("REC_SCORE", "min")
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
# 근거(연구 저장소 docs/34)
#   조금 달랐다 0.33 — 3단계 등급을 지수 gain(2^r − 1)으로 바꿔 최고값 1 로 나눈 값 0 · 0.33 · 1 (Järvelin & Kekäläinen 2002)
#   잘 모르겠다 0    — 설문에서 '모름' 은 의견이 아니라 결측으로 다룬다 (Krosnick 외 2002)
#   안 맞았다 −0.2   — Rocchio 관련성 피드백의 부정/긍정 비율 γ/β = 0.15/0.75 (Manning 외 2008). 부정을 아예 안 쓰면
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


def card_shift(S: np.ndarray, O: np.ndarray, W: np.ndarray, beta: float = 0.5) -> np.ndarray:
    """명함 교환 반영. W[i, j] = i 와 j 사이 명함 간선 가중치(대칭). i 의 Seek 를 명함을 교환한 사람들의 Offer
    가중 평균 쪽으로 beta 만큼 옮긴다 → 커피챗 추천에서 i 에게 그 사람들과 비슷한 새 사람이 더 올라온다.
    9/29 민찬 결정: 예전엔 i 의 Offer 를 옮겼다(1차 G★ 를 그대로 옮긴 모양). 그러면 명함 한 장으로 i 의 소개가 바뀌고
    i 자신의 추천은 거의 안 바뀐다. 명함 교환은 i 가 무엇에 관심 있는지를 더 잘 보여 주므로 만족도 · 포스터처럼 Seek 쪽에 넣는다.
    간선이 없는 사람은 그대로 둔다."""
    deg = W.sum(1)
    T = np.where(deg[:, None] > 0, W @ unit(O) / np.maximum(deg, 1e-12)[:, None], 0.0)
    return seek_toward(S, T, (deg > 0).astype(float), beta)


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
