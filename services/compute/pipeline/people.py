"""사람 사이 '이미 아는 사이' 판정(10/5 민찬 제안). 추천 목록에서 뒤로 미루고, 포스터 응답의 같은 소속 판정에 쓴다.

같은 소속   소속 글자를 맞춘 뒤 비교한다. 띄어쓰기 · 문장부호 · 대소문자 · 전각 무시, '대학교' → '대',
            단어 끝의 학과 · 학부 · 전공 · 과 · 부, 그다음 끝의 '학'을 지움
            예: '연세대학교 산업공학과' = '연세대 산업공학' = '연세대산업공',  '응용통계학과' = '응용통계'
            못 맞추는 것: 영문 · 약어('Yonsei' · 'YU'), 회사 이름 바뀜. 사전 등록 폼에서 소속을 고르게 하면 근본적으로 없어진다
이미 아는 사이   (같은 기수이면서 같은 소속) 또는 (같은 활동팀을 한 적 있음, participants.teams)
"""
from __future__ import annotations

import re
import unicodedata

import numpy as np

_PUNCT = re.compile(r"[\s\-_·.,/()\[\]{}'\"]+")


_ENDINGS = ("학과", "학부", "전공", "과", "부")


def _word(w: str) -> str:
    """단어 끝의 학과 표시를 지운다. '산업공학과' · '산업공학' → '산업공', '경영학부' · '경영학' → '경영'."""
    w = w.replace("대학교", "대")
    for e in _ENDINGS:
        if w.endswith(e) and len(w) > len(e) + 1:
            w = w[: -len(e)]
            break
    if w.endswith("학") and len(w) > 2:
        w = w[:-1]
    return w


def norm_affiliation(s: str | None) -> str:
    t = unicodedata.normalize("NFKC", s or "").lower()
    words = [w for w in re.split(r"[\s/(),·]+", t) if w]
    return _PUNCT.sub("", "".join(_word(w) for w in words))


def norm_team(s: str | None) -> str:
    return _PUNCT.sub("", unicodedata.normalize("NFKC", s or "").lower())


def acquainted(P: list[dict]) -> np.ndarray:
    """(n, n) bool. 대각선은 False."""
    n = len(P)
    coh = [p.get("cohort") for p in P]
    aff = [norm_affiliation(p.get("affiliation")) for p in P]
    teams = [{norm_team(t) for t in (p.get("teams") or []) if norm_team(t)} for p in P]
    M = np.zeros((n, n), dtype=bool)
    for i in range(n):
        for j in range(i + 1, n):
            same_place = coh[i] is not None and coh[i] == coh[j] and bool(aff[i]) and aff[i] == aff[j]
            if same_place or (teams[i] & teams[j]):
                M[i, j] = M[j, i] = True
    return M
