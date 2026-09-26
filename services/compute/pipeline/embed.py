"""문장 → 벡터. 모델은 multilingual-e5-small 이다.

근거 (연구 저장소 26-2_Modeling_RecSys 의 docs/31 · docs/33)
  문장 여러 개는 문장마다 벡터를 만들어 평균한다. 최댓값보다 정확했다(0.731 대 0.672).
  점수용 벡터에서 전체 평균을 빼지 않는다. 빼면 정확도가 0.78 에서 0.70 으로 떨어졌다.
  접두사는 기본 query: 이다. 한 방향 점수에서 passage: 가 나은지는 아직 비교하지 않았다(EMBED_PREFIX 로 바꾼다).
"""
from __future__ import annotations

import os
import re

import numpy as np

MODEL = os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")
PREFIX = os.environ.get("EMBED_PREFIX", "query: ")
MAX_CHARS = 200                     # 한 문장 상한. 한국어 한 글자가 약 0.6 토큰이라 512 토큰 한계에 한참 못 미친다

_SPLIT = re.compile(r"[\n;]+|(?<=[.!?。])\s+")


def split_items(text: str) -> list[str]:
    """자유 문장을 항목 단위로 나눈다. 줄바꿈 · 세미콜론 · 문장 끝으로 자른다."""
    return [s.strip()[:MAX_CHARS] for s in _SPLIT.split(text or "") if s.strip()]


def offer_items(offer_text: str, topic_tags: list[str]) -> list[str]:
    """Offer = 하는 일 + 주제 태그 (docs/SCHEMA.md 미정 항목의 현재 값)."""
    items = split_items(offer_text)
    if topic_tags:
        items.append("관심 주제: " + ", ".join(topic_tags))
    return items


def seek_items(seek_text: str, intent_tags: list[str]) -> list[str]:
    """Seek = 찾는 사람 + 관계 태그. 비어 있으면 빈 목록(점수 단계에서 Offer 로 대체)."""
    items = split_items(seek_text)
    if items and intent_tags:
        items.append("원하는 관계: " + ", ".join(intent_tags))
    return items


class Encoder:
    """모델을 한 번 올려 두고 재사용한다. 계산 서비스 기동 때 한 번 만든다."""

    def __init__(self, model: str = MODEL, prefix: str = PREFIX, device: str | None = None):
        from sentence_transformers import SentenceTransformer
        self.prefix = prefix
        self.model = SentenceTransformer(model, device=device or "cpu")

    def encode(self, sentences: list[str]) -> np.ndarray:
        if not sentences:
            return np.zeros((0, self.model.get_sentence_embedding_dimension()))
        v = self.model.encode([self.prefix + s for s in sentences], batch_size=64,
                              normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(v, dtype=np.float64)

    def people(self, item_lists: list[list[str]]) -> tuple[np.ndarray, np.ndarray]:
        """사람마다 항목 목록 → 항목 벡터 평균(정규화). 항목이 없는 사람은 blank=True, 벡터 0."""
        flat = [s for items in item_lists for s in items]
        owner = np.repeat(np.arange(len(item_lists)), [len(x) for x in item_lists])
        V = self.encode(flat)
        dim = V.shape[1] if len(V) else self.model.get_sentence_embedding_dimension()
        X = np.zeros((len(item_lists), dim))
        blank = np.array([len(x) == 0 for x in item_lists])
        for i in np.where(~blank)[0]:
            X[i] = V[owner == i].mean(0)
        return unit(X), blank


def unit(X: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(X, axis=-1, keepdims=True)
    return np.divide(X, n, out=np.zeros_like(X), where=n > 1e-12)
