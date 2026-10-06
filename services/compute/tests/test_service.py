"""service.py 한 바퀴 시험 — DB 대신 MemoryRepo, 모델 대신 FakeEncoder.

MemoryRepo 는 supabase/migrations/0001_init.sql 의 칸 이름을 그대로 쓴다. 실제 DB 로 바꿀 때 달라지는 것은 repo.py 뿐이다.
실행  cd services/compute && python tests/test_service.py
"""
from __future__ import annotations

import hashlib
import os
import random
import sys
import uuid
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import service  # noqa: E402
from repo import MemoryRepo  # noqa: E402
from pipeline.embed import unit  # noqa: E402

DIM = 64
FIELDS = ["추천시스템", "자연어처리", "시계열", "금융", "마케팅", "회계", "인과추론", "컴퓨터비전"]


class FakeEncoder:
    """단어마다 고정 무작위 벡터를 더하는 가짜 인코더. 같은 단어를 쓰면 가까워진다."""

    def _word(self, w):
        seed = int(hashlib.md5(w.encode()).hexdigest()[:8], 16)
        return np.random.default_rng(seed).normal(size=DIM)

    def encode(self, sentences):
        X = np.zeros((len(sentences), DIM))
        for k, s in enumerate(sentences):
            for w in s.replace(",", " ").replace("(", " ").replace(")", " ").split():
                X[k] += self._word(w)
        return unit(X)

    def people(self, item_lists):
        X = np.zeros((len(item_lists), DIM))
        blank = np.array([len(x) == 0 for x in item_lists])
        for i, items in enumerate(item_lists):
            for s in items:
                for w in s.replace(",", " ").split():
                    X[i] += self._word(w)
        return unit(X), blank


def seed_repo(n=70, n_host=8, n_staff=2, seed=0, n_fixed=0):
    """참가자 n(앞 n_host 명은 호스트) → 운영진 n_staff → 교수 · 운영진석(fixed_table=1) n_fixed 순서."""
    rng = random.Random(seed)
    repo = MemoryRepo()
    for i in range(n + n_staff + n_fixed):
        pid = str(uuid.UUID(int=i + 1))
        staff = n <= i < n + n_staff
        fixed = i >= n + n_staff
        host = (not staff) and (i < n_host or fixed)
        f, g = rng.choice(FIELDS), rng.choice(FIELDS)
        repo.t["participants"].append({"id": pid, "event_id": "dev", "display_name": f"사람{i}",
                                       "role": "staff" if staff else ("professor" if fixed else "alumni" if host else "student"),
                                       "cohort": None if host or staff else rng.randint(10, 14), "is_host": host,
                                       "fixed_table": 1 if fixed else None})
        repo.t["profiles"].append({"participant_id": pid, "offer_text": f"{f} 일을 한다. {g} 공부를 한다",
                                   "seek_text": "" if host or rng.random() < 0.15 else f"{rng.choice(FIELDS)} 선배를 만나고 싶다",
                                   "topic_tags": [f, g], "intent_tags": ["멘토링"] if rng.random() < 0.5 else []})
    return repo


def test_full_loop():
    # 참가자 70(호스트 8) + 운영진 2 + 교수 · 운영진석 3(fixed_table=1) = 75명
    repo, enc = seed_repo(n_fixed=3), FakeEncoder()
    ids = [p["id"] for p in repo.t["participants"]]
    fixed = set(ids[72:])

    # 1. 행사 전날 — 새 코드북, 전원 주소, 테이블토크 배정(전날 확정, 좌석 순서까지)
    r1 = service.precompute(repo, enc, iters=3000)
    assert r1["new_codebook"] and r1["issued"] == 75 and r1["n"] == 75 and r1["fixed"] == 3
    assert len(repo.t["sids"]) == 75                                    # 운영진 · 고정 테이블도 주소 받음
    assert all(len(s["offer_sid"]) == 3 and len(s["offer_vec"]) == DIM for s in repo.t["sids"])
    assert repo.active_codebook("dev")["version"] == r1["codebook_version"]   # 코드북 전용 표(0007)
    assert all(v["event_id"] == "dev" for v in repo.t["assign_versions"])   # 배정 버전에 행사 번호
    assert repo.t["labels"] and all(len(l["prefix"]) == 1 for l in repo.t["labels"])   # 첫자리 묶음만
    assert all(m["label"] is None for m in repo.t["tables_meta"])                           # 테이블 이름표 없음
    v1 = r1["version"]
    members = [m for m in repo.t["table_members"] if m["version"] == v1]
    t1 = {m["participant_id"]: m["table_no"] for m in members}
    assert len(members) == 75 and r1["tables"] == 9
    assert {t1[p] for p in fixed} == {1} and sum(t == 1 for t in t1.values()) == 3       # 1번 = 교수 · 운영진석만
    size = {t: sum(1 for x in t1.values() if x == t) for t in range(2, 10)}
    assert set(size) == set(t1.values()) - {1} and max(size.values()) - min(size.values()) <= 1   # 2~9번 고르게(72명 → 9명씩)
    for t in range(1, 10):                                                # 좌석 번호 1..k, 겹치지 않음
        seats = sorted(m["seat_no"] for m in members if m["table_no"] == t)
        assert seats == list(range(1, len(seats) + 1))
    assert all(m["reason"]["seat_no"] == m["seat_no"] for m in members)
    assert all(m["reason"].get("fixed") for m in members if m["participant_id"] in fixed)
    # 같은 기수 4명째부터 감점(상한 3). 시험 명단에 따라 넘침이 생길 수 있다 → 보고 값이 실제 넘친 수와 맞는지 본다
    reg = [p for p in repo.t["participants"] if p["id"] not in fixed and p.get("cohort") is not None]
    from collections import Counter
    cc = Counter((t1[p["id"]], p["cohort"]) for p in reg)
    assert r1["cohort_over"] == sum(max(0, v - service.TABLETALK_COHORT_CAP) for v in cc.values())
    assert len([p for p in repo.t["pair_scores"] if p["version"] == v1]) == 75 * 74 // 2
    repo.t["assign_versions"][-1]["status"] = "published"                # 전날 공개

    # 2. 체크인 마감 — 60명 체크인 + 현장 등록 2명. 주소만 붙이고 테이블토크는 다시 배정하지 않음
    for pid in ids[:60]:
        repo.t["checkins"].append({"participant_id": pid})
    for k in range(2):
        pid = str(uuid.uuid4())
        repo.t["participants"].append({"id": pid, "event_id": "dev", "display_name": f"워크인{k}", "role": "student",
                                       "cohort": 14, "is_host": False})
        repo.t["profiles"].append({"participant_id": pid, "offer_text": "추천시스템 인턴을 한다", "seek_text": "",
                                   "topic_tags": ["추천시스템"], "intent_tags": []})
        repo.t["checkins"].append({"participant_id": pid})
    before = {s["participant_id"]: s["offer_sid"] for s in repo.t["sids"]}
    n_versions = len(repo.t["assign_versions"])
    r2 = service.precompute(repo, enc, reuse_codebook=True, iters=3000)
    assert not r2["new_codebook"] and r2["issued"] == 2 and r2["version"] is None
    assert len(repo.t["assign_versions"]) == n_versions                  # 새 배정 버전 없음(전날 확정)
    after = {s["participant_id"]: s["offer_sid"] for s in repo.t["sids"]}
    assert all(after[p] == before[p] for p in before)                    # 먼저 받은 주소는 그대로
    # 현장 등록자 자리는 운영 콘솔 워크인 추가(A-05)가 정함. 여기서는 그 결과를 흉내 내 4번 테이블 끝에 앉힘
    for k, pid in enumerate([p["id"] for p in repo.t["participants"][-2:]]):
        repo.t["table_members"].append({"version": v1, "table_no": 4, "participant_id": pid, "seat_no": 50 + k,
                                        "reason": {"table_no": 4, "text": "워크인(운영 콘솔)"}})
    tab = [m for m in repo.t["table_members"] if m["version"] == v1]

    # 3. 테이블토크 중 명함 교환 · 만족도 (응답률 70%)
    by_table = {}
    for m in tab:
        by_table.setdefault(m["table_no"], []).append(m["participant_id"])
    for g in by_table.values():
        for a in g:
            for b in g:
                if a < b:
                    repo.t["card_exchanges"].append({"scanner_id": a, "scanned_id": b})
    checked = [m["participant_id"] for m in tab if m["participant_id"] in set(ids[:60]) or m["seat_no"] >= 50]
    answers = ["gained", "different", "unsure", "mismatch"]
    for k, pid in enumerate(checked[: int(len(checked) * 0.7)]):
        repo.t["satisfaction"].append({"participant_id": pid, "round": "tabletalk", "choice": answers[k % 4]})

    # 포스터세션 중 관심도 (커피챗 계산 전까지 들어온 답만 쓴다)
    repo.t["posters"] = [{"id": 1, "title": "추천 포스터", "tags": ["추천시스템"]}, {"id": 2, "title": "금융 포스터", "tags": ["금융"]}]
    repo.t["poster_interest"] = [{"participant_id": checked[0], "poster_id": 1, "choice": "learn_more"},
                                 {"participant_id": checked[0], "poster_id": 2, "choice": "interesting"},
                                 {"participant_id": checked[1], "poster_id": 2, "choice": "not_mine"}]

    # 4. 커피챗
    r3 = service.coffeechat(repo, enc, iters=5000)
    assert r3["forbid_hits"] == 0 and not r3["fallback"]                  # 테이블토크 동석자와 다시 안 앉음
    recs = [r for r in repo.t["recs"] if r["version"] == r3["version"]]
    assert len(recs) == 62 * 12                                          # 체크인 60 + 현장 등록 2
    t2 = {m["participant_id"]: m["table_no"] for m in tab}
    assert all(t2[r["participant_id"]] != t2[r["target_id"]] for r in recs)   # 이미 만난 사람은 추천 안 함
    assert repo.ops_get("compute_heartbeat")["last"] == "coffeechat"
    # 배정 이유 — 운영진 대시보드용
    cm = [m for m in repo.t["table_members"] if m["version"] == r3["version"]]
    assert all(m["reason"]["table_no"] == m["table_no"] and m["reason"]["text"] for m in cm)
    assert all(m["reason"]["from_table"] == t2[m["participant_id"]] for m in cm)          # 이전 테이블
    by_pid = {m["participant_id"]: m["reason"] for m in cm}
    assert by_pid[checked[0]]["satisfaction"] == "gained" and "새로 얻은 게 있었다" in by_pid[checked[0]]["text"]
    assert all(r.get("exchanges", 0) >= 1 for r in by_pid.values())                        # 테이블토크 동석자와 전부 교환함
    assert all(m.get("reason") and "from_table" not in m["reason"] for m in tab)          # 테이블토크 배정은 이전 테이블 없음
    assert by_pid[checked[0]]["posters"] == 2 and "관심 포스터 2개 반영" in by_pid[checked[0]]["text"]
    assert "posters" not in by_pid[checked[1]] and by_pid[checked[1]]["posters_not"] == 1   # 관심 분야 아님은 밀어내는 쪽
    assert "관심 없다고 한 포스터 1개 반영" in by_pid[checked[1]]["text"]
    v3 = next(v for v in repo.t["assign_versions"] if v["version"] == r3["version"])
    assert v3["params"]["poster_answers"] == 3 and v3["params"]["poster_people"] == 2
    assert sum(v3["params"]["sat_counts"].values()) == int(len(checked) * 0.7)
    print("  이유 예:", by_pid[checked[0]]["text"])
    print(f"  전날 {r1['tables']}테이블({size}) · 체크인 뒤 워크인 주소 {r2['issued']}명 · 커피챗 {r3['tables']}테이블 · 추천 {len(recs)}행")


def test_v02_signals_recs_reasons():
    """v0.2: 전날 추천 목록(B-06) · 포스터 응답 전처리(B-05) · 커피챗 그룹 근거 한 줄(B-07) · 궤도 라벨(B-08) · 포스터 없는 점수."""
    repo, enc = seed_repo(n=40, n_staff=0), FakeEncoder()
    ids = [p["id"] for p in repo.t["participants"]]
    for k, p in enumerate(repo.t["participants"]):
        p["affiliation"] = "연세대" if k < 20 else "카카오"
    r1 = service.precompute(repo, enc, iters=500)
    v1 = r1["version"]
    t1 = {m["participant_id"]: m["table_no"] for m in repo.t["table_members"] if m["version"] == v1}
    recs1 = [r for r in repo.t["recs"] if r["version"] == v1]
    assert len(recs1) == 40 * 12 and all(t1[r["participant_id"]] != t1[r["target_id"]] for r in recs1)   # 같은 테이블 사람 빼고
    coh = {p["id"]: (p["cohort"], p["affiliation"]) for p in repo.t["participants"]}
    same = sum(1 for r in recs1 if coh[r["participant_id"]][0] is not None and coh[r["participant_id"]] == coh[r["target_id"]])
    assert same <= len(recs1) * 0.05                                 # 같은 기수 · 같은 소속은 거의 안 뜸(감점)
    assert not any(coh[r["participant_id"]][0] is not None and coh[r["participant_id"]] == coh[r["target_id"]]
                   for r in recs1 if r["kind"] == "explore")             # 탐색 칸으로 다시 들어오지도 않음
    meta1 = [m for m in repo.t["tables_meta"] if m["version"] == v1]
    assert all("orbit_label" in m and "orbit_prefix" in m for m in meta1) and any(m["orbit_label"] for m in meta1)
    repo.t["assign_versions"][-1]["status"] = "published"

    for pid in ids:
        repo.t["checkins"].append({"participant_id": pid})
    for k, pid in enumerate(ids[:30]):
        repo.t["satisfaction"].append({"participant_id": pid, "round": "tabletalk", "choice": "gained"})
    repo.t["posters"] = [{"id": q, "title": f"{FIELDS[q]} 포스터", "tags": [FIELDS[q]], "summary": f"{FIELDS[q]} 연구",
                          "presenter_ids": [ids[39]] if q == 1 else []} for q in range(1, 5)]
    for k, pid in enumerate(ids[:20]):                                # 20명이 포스터 3개씩
        for seq, q in enumerate((1, 2, 3), start=1):
            repo.t["poster_responses"].append({"participant_id": pid, "poster_id": q, "reason": "topic", "seq_no": seq,
                                               "latency_ms": 30000, "quiz_attempted": seq == 3,
                                               "created_at": f"2026-10-31T16:{20 + seq * 5:02d}:00+09:00"})
    r3 = service.coffeechat(repo, enc, iters=2000)
    v3 = next(v for v in repo.t["assign_versions"] if v["version"] == r3["version"])
    assert v3["params"]["poster_source"] == {"poster_responses": 20, "poster_interest": 0} and v3["params"]["poster_people"] == 20
    assert r3["groups"] == 10 and r3["forbid_hits"] == 0                # 40명 → 4명 그룹 10개
    cm = {m["participant_id"]: m["table_no"] for m in repo.t["table_members"] if m["version"] == r3["version"]}
    gr = [g for g in repo.t["group_reasons"] if g["version"] == r3["version"]]
    assert gr and r3["group_reasons"] == len(gr)
    assert all(cm[g["participant_id"]] == cm[g["target_id"]] and g["participant_id"] != g["target_id"] for g in gr)
    assert all(g["kind"] in ("seek_offer", "offer_seek", "common_tags") and "점수" not in g["text"] for g in gr)
    ps = [p for p in repo.t["pair_scores"] if p["version"] == r3["version"]]
    assert all("score_no_poster" in p for p in ps) and any(abs(p["score"] - p["score_no_poster"]) > 1e-6 for p in ps)
    print("  근거 예:", gr[0]["text"])


def test_final_recs_keep_groups():
    """행사 직후 추천(final): 커피챗 그룹은 그대로, 추천 목록만 다시. 동석자 · 교환한 사람은 빠지고, 커피챗 전이면 거절."""
    repo, enc = seed_repo(n=40, n_staff=0), FakeEncoder()
    ids = [p["id"] for p in repo.t["participants"]]
    service.precompute(repo, enc, iters=300)
    repo.t["assign_versions"][-1]["status"] = "published"
    for pid in ids:
        repo.t["checkins"].append({"participant_id": pid})
    try:
        service.coffeechat(repo, enc, iters=300, final=True)
    except ValueError as e:
        assert "커피챗 배정이 없다" in str(e)
    else:
        raise AssertionError("커피챗 전 final 을 막지 않았다")
    r = service.coffeechat(repo, enc, iters=500)
    repo.t["assign_versions"][-1]["status"] = "published"
    g = {m["participant_id"]: m["table_no"] for m in repo.t["table_members"] if m["version"] == r["version"]}
    a, b = ids[0], next(q for q in ids if g[q] != g[ids[0]])           # 커피챗 뒤 다른 그룹 사람과 교환
    repo.t["card_exchanges"] += [{"scanner_id": a, "scanned_id": b, "source": "qr"}, {"scanner_id": b, "scanned_id": a, "source": "auto"}]
    f = service.coffeechat(repo, enc, final=True)
    assert f["final"] and f["version"] != r["version"]
    v = next(x for x in repo.t["assign_versions"] if x["version"] == f["version"])
    assert v["round"] == "coffeechat" and v["params"]["kind"] == "final" and v["status"] != "published"   # 운영자가 공개
    g2 = {m["participant_id"]: m["table_no"] for m in repo.t["table_members"] if m["version"] == f["version"]}
    assert g2 == g                                                      # 그룹 · 테이블 번호 그대로
    recs = [x for x in repo.t["recs"] if x["version"] == f["version"]]
    assert recs and not any(x["participant_id"] == a and x["target_id"] == b for x in recs)        # 교환한 사람 빠짐
    assert not any(g[x["participant_id"]] == g[x["target_id"]] for x in recs)                       # 커피챗 동석자 빠짐
    assert repo.ops_get("compute_heartbeat")["last"] == "final"


def test_search_and_query_shift():
    repo, enc = seed_repo(n=30, n_staff=0), FakeEncoder()
    service.precompute(repo, enc, iters=300)
    repo.t["assign_versions"][-1]["status"] = "published"
    ids = [p["id"] for p in repo.t["participants"]]
    for pid in ids:
        repo.t["checkins"].append({"participant_id": pid})
    r = service.search(repo, enc, "추천시스템 일을 한다", viewer_id=ids[0])
    assert r["people"] and ids[0] not in {p["id"] for p in r["people"]} and len(r["people"]) <= 10
    hit = r["people"][0]["id"]
    prof = {p["participant_id"]: p for p in repo.t["profiles"]}
    assert "추천시스템" in prof[hit]["offer_text"] or "추천시스템" in prof[hit]["topic_tags"]
    # 줄임말 사전: 사전 표기(추천시스템)를 붙이면 글자가 전혀 다른 검색어로도 같은 사람이 맨 위
    r2 = service.search(repo, enc, "RecSys", viewer_id=ids[0], aliases=["추천시스템"])
    assert r2["people"] and r2["people"][0]["id"] == hit
    # 항목 벡터는 하는 일 · 태그가 바뀐 사람만 다시 만든다
    calls = []
    real = enc.encode
    enc.encode = lambda xs: (calls.append(len(xs)), real(xs))[1]
    service._SEARCH_CACHE.clear()
    prof[ids[3]]["offer_text"] = "회계 감사를 한다"
    service.search(repo, enc, "회계", viewer_id=ids[0])
    n_items = len(service.searchm.search_items("회계 감사를 한다", prof[ids[3]].get("topic_tags")))
    assert calls == [n_items, 1], calls                  # 바뀐 1명 항목 + 검색어 1개
    enc.encode = real
    # pool: 웹에서 검색할 수 있는 사람만(동의 안 한 사람은 결과 · 점수에 안 나옴)
    r4 = service.search(repo, enc, "추천시스템 일을 한다", viewer_id=ids[0], pool=[pid for pid in ids if pid != hit])
    assert hit not in {p["id"] for p in r4["people"]} and hit not in r4["all_scores"]
    assert set(r4["all_scores"]) == set(ids) - {ids[0], hit}
    assert service.search(repo, enc, "회계", pool=[])["people"] == []
    now = datetime.now(timezone.utc).isoformat()
    repo.t["event_log"] += [{"participant_id": ids[1], "kind": "keyword_search", "payload": {"q": "금융"}, "created_at": now},
                            {"participant_id": ids[2], "kind": "keyword_search", "payload": {"q": "회계"}, "created_at": now},
                            {"participant_id": ids[2], "kind": "keyword_open", "payload": {"q": "회계", "target_id": ids[5]},
                             "created_at": now}]
    r3 = service.coffeechat(repo, enc, iters=300)
    v3 = next(v for v in repo.t["assign_versions"] if v["version"] == r3["version"])
    assert v3["params"]["search"]["people"] == 2 and v3["params"]["search"]["opened"] == 1


def test_fixed_table_other_than_one_is_refused():
    repo, enc = seed_repo(n=30, n_staff=0, n_fixed=2), FakeEncoder()
    repo.t["participants"][-1]["fixed_table"] = 3
    try:
        service.precompute(repo, enc, iters=100)
    except ValueError as e:
        assert "1번만" in str(e)
    else:
        raise AssertionError("고정 테이블 3 을 막지 않았다")


def test_other_event_does_not_leak():
    """다른 행사의 공개 배정 · 코드북이 섞여 있어도 이 행사 것만 쓴다."""
    repo, enc = seed_repo(), FakeEncoder()
    other = seed_repo(n=12, n_host=2, seed=9)
    for p in other.t["participants"]:
        p["event_id"] = "other"
        p["id"] = "o-" + p["id"]
    for p in other.t["profiles"]:
        p["participant_id"] = "o-" + p["participant_id"]
    repo.t["participants"] += other.t["participants"]
    repo.t["profiles"] += other.t["profiles"]
    service.precompute(repo, enc, event_id="other", iters=200)
    repo.t["assign_versions"][-1]["status"] = "published"               # 다른 행사의 공개 배정
    r1 = service.precompute(repo, enc, iters=500)                       # 이 행사는 초안만
    assert repo.active_codebook("dev")["version"] == r1["codebook_version"]
    assert repo.active_codebook("other")["version"] != r1["codebook_version"]
    assert {v["event_id"] for v in repo.t["assign_versions"]} == {"dev", "other"}
    ids = [p["id"] for p in repo.participants("dev")]
    got = repo.latest_tables("tabletalk", ids)
    assert got and {m["version"] for m in got} == {r1["version"]}      # 다른 행사의 공개 배정을 집지 않음
    r = service.coffeechat(repo, enc, iters=2000)
    assert r["forbid_hits"] == 0


def test_fallback_when_few_responses():
    repo, enc = seed_repo(), FakeEncoder()
    service.precompute(repo, enc, iters=500)
    r = service.coffeechat(repo, enc, iters=500)                          # 만족도 0건 → 대체 경로
    assert r["fallback"] and r["response_rate"] == 0


def test_errors():
    repo, enc = seed_repo(n=3, n_host=0, n_staff=0), FakeEncoder()   # 3명뿐
    for fn, kw in ((service.precompute, {}), (service.precompute, {"reuse_codebook": True}), (service.coffeechat, {})):
        try:
            fn(repo, enc, **kw)
        except ValueError:
            continue
        raise AssertionError(f"{fn.__name__} 가 사람 부족을 막지 않았다")
    repo = seed_repo()
    try:
        service.precompute(repo, enc, reuse_codebook=True)
    except ValueError as e:
        assert "코드북" in str(e)
    else:
        raise AssertionError("코드북 없이 reuse 가 통과했다")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
