"""쌍 점수. 벡터로 계산하고 주소는 쓰지 않는다(접두사로 후보를 줄이면 recall 0.042 → 0.020).

a[i, j] = cos(seek_i, offer_j)   i 가 j 에게서 얻는 것 (한 방향)

쓰는 곳 (연구 저장소 docs/33 G16c · 노션 9/23 1-1)
  개인 추천 목록     a 그대로. 리허설 정답("내가 건진 게 있나")이 한 사람의 답이라 한 방향이 정의에 맞다
                     공동저술 사람별 비교에서 a 0.713 · min 0.694
  테이블 배정       두 사람이 같이 앉으므로 두 방향을 합친다. min · 평균 · 조화평균 중 무엇이 나은지는 리허설에서 정한다
                     세 값을 pair_scores 에 같이 남긴다(score_ab, score_ba)
  호스트            want 가 없다. 학생 ↔ 호스트 쌍은 학생 쪽 한 방향만 쓴다. 호스트끼리는 0
"""
from __future__ import annotations

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


def inject(O: np.ndarray, W: np.ndarray, beta: float = 0.5) -> np.ndarray:
    """만남 반영 (G★ 직교 주입). W[i, j] = i 와 j 사이 간선 가중치(대칭).

    이웃 평균에서 내 방향과 직교하는 성분만 내 크기에 비례해 더한다. 주소는 바꾸지 않고 점수용 벡터만 바꾼다.
    구인구직 자료에서 beta 0.5 가 최적이었다(Beauty 는 1.0). 간선이 없는 사람은 그대로 둔다.
    """
    O = unit(O)
    Z = O.copy()
    deg = W.sum(1)
    for i in np.where(deg > 0)[0]:
        m = (W[i][:, None] * O).sum(0) / deg[i]
        r = m - (m @ O[i]) * O[i]
        nr = np.linalg.norm(r)
        if nr > 1e-12:
            Z[i] = O[i] + beta * r / nr
    return unit(Z)
