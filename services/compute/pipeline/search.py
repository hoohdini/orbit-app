"""사람 찾기 검색의 '뜻 검색'과 검색어 → 추천 반영 (10/5 민찬 제안, 시제품).

뜻 검색 — 검색어를 문장 모델로 벡터로 바꿔, 사람마다 '하는 일' 문장 · 관심 태그 하나하나와 cos 를 재고 가장 높은 것을
  그 사람 점수로 쓴다(문장별 최고, 10/5 민찬 결정). 추천용 Offer 벡터(항목 평균)를 쓰면 문장이 여럿인 사람은 맞는 문장 하나가
  평균에 묻혔다. 글자가 달라도 뜻이 가까우면 찾는다. 그날 체크인한 사람들 사이에서 평균 + 1 표준편차 이상인 사람만, 최대 10명.
  웹이 같은 뜻 다른 표기(줄임말 사전, 웹 apps/web/app/api/card/_aliases.json)를 aliases 로 보내면 검색어 뒤에 괄호로 붙여 벡터로 바꾼다.
  작은 모델(e5-small)이 '언어모델' 과 'LLM' 을 잇지 못해서다. 10명 시험(10/5, 검색어 14개 · 정답 22명, 검색어 · 정답 · 사전을
  모두 민찬 쪽에서 만듦 → 좋게 나왔을 수 있음): 지금 13/22 · 틀린 사람 12 → 문장별 최고 + 사전 21/22 · 5.
  기준(1 표준편차 · 10명)은 출발값이다. 글자로 맞은 사람이 있으면, 뜻으로만 찾은 사람은 글자로 맞은 사람 중 가장 낮은
  cos 이상일 때만 넣는다(뜻 검색이 글자 검색보다 약한 짝을 끌어오지 않게. 10/5 '언어모델' 시험에서 '추천 모델' 사람이 들어온 문제).
  웹은 합친 결과를 추천 점수(상호 점수) 순으로 보여 주고, 0.5초 안에 답이 없으면 글자 검색 결과만 쓴다.

검색어 → 추천 반영 — 커피챗 계산 때 그 사람의 '찾는 사람'(Seek) 방향을 검색한 쪽으로 조금 옮긴다. 근거 조사(10/5) 결과
  검색어와 클릭 · 평점의 상대 비중을 숫자로 준 연구는 없어서 아래 값은 신호의 확실한 정도에 맞춘 출발값이다.
  - 검색만 함                         검색어 쪽으로 폭 0.1 (포스터 최대 0.2 의 절반. 말한 선호와 실제로 끌린 상대가 잘 안 맞았다 — Eastwick & Finkel 2008)
  - 검색 결과에서 그 사람을 열어 봄    그 사람의 Offer 쪽으로 폭 0.2 (클릭이 이어진 검색만 쓴 구인 매칭 SHPJF, Hou 외 2022 와 같은 생각)
  - 열어 본 사람과 명함까지 교환함      그 사람 Offer 쪽으로 폭 0.3. 일반 명함 반영에 더해 준다(10/5 민찬 결정: 직접 검색하고 교환까지 간 것은
                                        추천에 떠서 해 본 교환보다 확실한 관심 증거). 조사 보고서는 두 번 세지 말라고 했지만 이 경우는 일부러 더 준다
  - 2분 안에 이어 친 검색어는 마지막 것만(고쳐 친 것)
  - 오래된 검색일수록 약하게: 40분마다 절반
  - 결과가 0명이었던 검색(오타 등)은 쓰지 않는다. 같은 열어 봄을 두 번 세지 않는다. 교환은 열어 본 뒤에 한 것만 0.3
  - 상한: 검색어 반영 뒤 Seek 가 행사 전 저장된 Seek 와 cos 0.85 아래로 멀어지지 않게 폭을 줄인다(설계 선택, 문헌 값 아님).
    목표를 지나쳐 가지 않게 폭을 목표까지의 각도로 자른다
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from .embed import split_items, unit

SEMANTIC_TOP = 10
SEMANTIC_Z = 1.0

QUERY_BETA = 0.1
OPEN_BETA = 0.2
SEARCH_EXCHANGE_BETA = 0.3
CHAIN_SECONDS = 120
OPEN_WINDOW_SECONDS = 15 * 60
HALF_LIFE_MIN = 40
MIN_COS_TO_BEFORE = 0.85


def search_items(offer_text: str, topic_tags: list[str] | None) -> list[str]:
    """뜻 검색용 항목. 추천용 offer_items 와 달리 태그를 한 줄에 몰지 않고 하나씩 둔다('LLM' 태그 하나가 다른 태그에 묻히지 않게)."""
    return split_items(offer_text) + [f"관심 주제: {t.strip()}" for t in topic_tags or [] if str(t).strip()]


def query_text(q: str, aliases: list[str] | None) -> str:
    """검색어 + 같은 뜻 다른 표기. '언어모델' + ['LLM', '대규모 언어 모델'] → '언어모델 (LLM, 대규모 언어 모델)'."""
    seen = {q.strip().lower()}
    extra = []
    for a in aliases or []:
        a = str(a).strip()
        if a and a.lower() not in seen:
            seen.add(a.lower())
            extra.append(a)
    return f"{q} ({', '.join(extra)})" if extra else q


def person_max(s_items: np.ndarray, owner: np.ndarray, n: int) -> np.ndarray:
    """항목별 cos → 사람별 최고 cos. owner[k] = 항목 k 의 사람 번호. 항목이 없는 사람은 -1."""
    out = np.full(n, -1.0)
    np.maximum.at(out, owner, s_items)
    return out


def semantic_rank(qv: np.ndarray, O: np.ndarray, ids: list[str], exclude: set[str]) -> list[tuple[str, float]]:
    """qv = 검색어 단위 벡터, O = 사람별 단위 벡터. 사람별 점수가 이미 있으면 rank_scores 를 쓴다."""
    return rank_scores(O @ qv, ids, exclude)


def rank_scores(s: np.ndarray, ids: list[str], exclude: set[str]) -> list[tuple[str, float]]:
    """s = 사람별 cos. 기준(평균 + 1 표준편차)을 넘는 사람을 cos 높은 순으로 [(id, cos)].
    웹은 글자로 맞은 사람이 있으면 이 기준 대신 '글자로 맞은 사람 중 가장 낮은 cos 이상'으로 더 엄하게 거른다(all_scores 를 씀)."""
    keep = [k for k, pid in enumerate(ids) if pid not in exclude]
    if not keep:
        return []
    s = np.asarray(s, dtype=float)[keep]
    floor = s.mean() + SEMANTIC_Z * s.std()
    order = np.argsort(-s)
    return [(ids[keep[k]], float(s[k])) for k in order[:SEMANTIC_TOP] if s[k] >= floor]


def _ts(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    if d.tzinfo is None:                                  # 시간대가 없으면 UTC 로 본다(DB 의 timestamptz 는 늘 시간대가 있다)
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


def query_targets(logs: list[dict], idx: dict[str, int], exchanged_at: dict[tuple[int, int], float],
                  now: float) -> tuple[list[dict], dict]:
    """event_log(keyword_search · keyword_open) → 반영할 목표 [{i, text 또는 target, beta}] 와 집계.
    exchanged_at = {(작은 번호, 큰 번호): 그 쌍이 처음 명함을 교환한 시각(초)}. 시각을 모르면 0.

    묶기   한 사람의 검색을 시간순으로 보고, 앞 검색과 2분 안이면 같은 묶음(고쳐 친 것). 묶음의 검색어 = 마지막 것
    열어 봄 열어 본 기록마다, 그 검색어가 들어 있는 묶음 중 그 시각 직전의 것 하나에만 붙인다(두 번 세지 않게).
           묶음 시작 ~ 마지막 검색 뒤 15분 안이어야 한다
    폭    열어 본 사람이 있으면 그 사람 Offer 쪽으로 0.2, 그 사람과 '열어 본 뒤에' 명함을 교환했으면 0.3.
          열어 본 사람이 없으면 검색어 쪽으로 0.1. 결과가 0명이었던 검색(오타 등)은 쓰지 않는다
    감쇠  묶음의 마지막 검색 시각부터 40분마다 절반"""
    stat = {"searches": 0, "zero_hit": 0, "chained": 0, "opened": 0, "opened_exchanged": 0, "used": 0}
    by: dict[str, list[dict]] = {}
    for r in logs:
        if r.get("participant_id") in idx and r.get("kind") in ("keyword_search", "keyword_open"):
            by.setdefault(r["participant_id"], []).append(r)
    out: list[dict] = []
    for pid, rs in by.items():
        i = idx[pid]
        rs.sort(key=lambda r: _ts(r["created_at"]))
        searches = [r for r in rs if r["kind"] == "keyword_search" and (r.get("payload") or {}).get("q")]
        stat["searches"] += len(searches)
        chains: list[dict] = []
        for r in searches:
            t = _ts(r["created_at"])
            if chains and t - chains[-1]["end"] <= CHAIN_SECONDS:
                c = chains[-1]
                stat["chained"] += 1
            else:
                c = {"start": t, "qs": set(), "opens": [], "zero": False}
                chains.append(c)
            c["end"], c["q"] = t, r["payload"]["q"]
            c["qs"].add(r["payload"]["q"])
            c["zero"] = (r.get("payload") or {}).get("hits") == 0   # 마지막 검색이 0명이었나
        for o in (r for r in rs if r["kind"] == "keyword_open"):
            pl, t = o.get("payload") or {}, _ts(o["created_at"])
            fit = [c for c in chains if pl.get("q") in c["qs"] and c["start"] <= t <= c["end"] + OPEN_WINDOW_SECONDS]
            if fit and pl.get("target_id") in idx:
                max(fit, key=lambda c: c["start"])["opens"].append((idx[pl["target_id"]], t))
        for c in chains:
            decay = 0.5 ** (max(0.0, now - c["end"]) / 60 / HALF_LIFE_MIN)
            if c["opens"]:
                seen = set()
                for j, t_open in c["opens"]:
                    if j in seen or j == i:
                        continue
                    seen.add(j)
                    t_ex = exchanged_at.get((min(i, j), max(i, j)))
                    if t_ex is not None and t_ex >= t_open:
                        out.append({"i": i, "target": j, "beta": SEARCH_EXCHANGE_BETA * decay})
                        stat["opened_exchanged"] += 1
                    else:
                        out.append({"i": i, "target": j, "beta": OPEN_BETA * decay})
                        stat["opened"] += 1
            elif c["zero"]:
                stat["zero_hit"] += 1
            else:
                out.append({"i": i, "text": c["q"], "beta": QUERY_BETA * decay})
    stat["used"] = len(out)
    stat["people"] = len({o["i"] for o in out})
    return out, stat


def apply_queries(S: np.ndarray, items: list[dict], O: np.ndarray, encode, S_ref: np.ndarray | None = None) -> np.ndarray:
    """사람마다 목표 = 폭으로 가중 평균한 벡터(검색어 벡터 또는 열어 본 사람 Offer), 옮기는 폭 = 가장 큰 폭.
    목표를 지나치지 않게 폭을 목표까지의 각도로 자른다. S_ref(행사 전 저장된 Seek)를 주면, 옮긴 뒤 S_ref 와 cos 가
    MIN_COS_TO_BEFORE 아래가 되지 않게 폭을 반씩 줄인다(행사 내내 쌓인 이동이 원래 찾던 것에서 너무 멀어지지 않게)."""
    S = unit(S)
    if not items:
        return S
    ref = unit(S_ref) if S_ref is not None else S
    texts = sorted({it["text"] for it in items if "text" in it})
    TV = dict(zip(texts, unit(np.asarray(encode(texts), dtype=float)))) if texts else {}
    Z = S.copy()
    for i in sorted({it["i"] for it in items}):
        mine = [it for it in items if it["i"] == i]
        vec = sum(it["beta"] * (TV[it["text"]] if "text" in it else unit(O[it["target"]])) for it in mine)
        T = unit(vec / sum(it["beta"] for it in mine))
        r = T - (T @ S[i]) * S[i]
        nr = np.linalg.norm(r)
        if nr < 1e-12:
            continue
        b = min(max(it["beta"] for it in mine), nr / max(T @ S[i], 1e-6))   # tan(목표까지 각) 이상 가지 않음
        z = unit(S[i] + b * r / nr)
        for _ in range(8):
            if z @ ref[i] >= MIN_COS_TO_BEFORE:
                break
            b /= 2
            z = unit(S[i] + b * r / nr)
        Z[i] = z
    return Z
