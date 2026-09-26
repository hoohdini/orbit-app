"""주소(SID) 발급. 공유 코드북 하나에 Offer 와 Seek 를 같이 넣는다.

규칙 (회의록 14 · 연구 저장소 docs/33 G20)
  출처별 평균 제거 — Offer 와 Seek 는 문체가 달라 그냥 섞으면 문체로 갈린다. 각자 자기 평균을 뺀다.
  주소는 행사 전날 한 번 발급하고 고정한다. 다시 학습하면 같은 1층이던 쌍 중 34% 만 같이 남아 이름표와 어긋난다.
  늦게 온 사람은 고정된 코드북에서 층마다 가장 가까운 중심을 찾아 붙인다(재학습 없음).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans


@dataclass
class Codebook:
    mu_offer: np.ndarray
    mu_seek: np.ndarray
    centers: list[np.ndarray]           # 층마다 (K, dim)
    version: str

    def address(self, V: np.ndarray, source: str) -> np.ndarray:
        """V (n, dim) → 주소 (n, L). source 는 'offer' 또는 'seek'."""
        R = V - (self.mu_offer if source == "offer" else self.mu_seek)
        codes = np.zeros((len(V), len(self.centers)), dtype=int)
        for lv, C in enumerate(self.centers):
            k = ((R[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
            codes[:, lv] = k
            R = R - C[k]
        return codes


def fit(offer: np.ndarray, seek: np.ndarray, version: str, K: int = 8, L: int = 3,
        n_init: int = 10, seed: int = 42) -> Codebook:
    """offer · seek (n, dim) 로 코드북을 학습한다. 빈 Seek 행은 호출 전에 빼고 넘긴다."""
    mu_o, mu_s = offer.mean(0), seek.mean(0)
    R = np.vstack([offer - mu_o, seek - mu_s])
    centers = []
    for lv in range(L):
        km = KMeans(n_clusters=min(K, len(R)), n_init=n_init, random_state=seed + lv).fit(R)
        centers.append(km.cluster_centers_)
        R = R - km.cluster_centers_[km.labels_]
    return Codebook(mu_o, mu_s, centers, version)


def disambiguate(codes: np.ndarray) -> np.ndarray:
    """같은 주소를 받은 사람에게 0, 1, 2 … 구분 번호를 붙인다(먼저 나온 순서)."""
    seen: dict[tuple, int] = {}
    d = np.zeros(len(codes), dtype=int)
    for i, c in enumerate(map(tuple, codes)):
        d[i] = seen.get(c, 0)
        seen[c] = d[i] + 1
    return d


def collision_rate(codes: np.ndarray) -> float:
    """주소가 다른 사람과 겹치는 사람의 비율."""
    _, inv, cnt = np.unique(codes, axis=0, return_inverse=True, return_counts=True)
    return float((cnt[inv] > 1).mean()) if len(codes) else 0.0
