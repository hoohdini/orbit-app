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

    def people(self, item_lists):
        X = np.zeros((len(item_lists), DIM))
        blank = np.array([len(x) == 0 for x in item_lists])
        for i, items in enumerate(item_lists):
            for s in items:
                for w in s.replace(",", " ").split():
                    X[i] += self._word(w)
        return unit(X), blank


def seed_repo(n=70, n_host=8, n_staff=2, seed=0):
    rng = random.Random(seed)
    repo = MemoryRepo()
    for i in range(n + n_staff):
        pid = str(uuid.UUID(int=i + 1))
        staff = i >= n
        host = (not staff) and i < n_host
        f, g = rng.choice(FIELDS), rng.choice(FIELDS)
        repo.t["participants"].append({"id": pid, "event_id": "dev", "display_name": f"사람{i}",
                                       "role": "staff" if staff else ("alumni" if host else "student"),
                                       "cohort": None if host or staff else rng.randint(10, 14), "is_host": host})
        repo.t["profiles"].append({"participant_id": pid, "offer_text": f"{f} 일을 한다. {g} 공부를 한다",
                                   "seek_text": "" if host or rng.random() < 0.15 else f"{rng.choice(FIELDS)} 선배를 만나고 싶다",
                                   "topic_tags": [f, g], "intent_tags": ["멘토링"] if rng.random() < 0.5 else []})
    return repo


def test_full_loop():
    repo, enc = seed_repo(), FakeEncoder()
    ids = [p["id"] for p in repo.t["participants"] if p["role"] != "staff"]

    # 1. 행사 전날 — 새 코드북, 전원 주소, 테이블토크 배정
    r1 = service.precompute(repo, enc, iters=3000)
    assert r1["new_codebook"] and r1["issued"] == 70 and r1["n"] == 70
    assert len(repo.t["sids"]) == 70                                    # 운영진은 주소 없음
    assert all(len(s["offer_sid"]) == 3 and len(s["offer_vec"]) == DIM for s in repo.t["sids"])
    assert repo.ops_get("codebook_active:dev") == r1["codebook_version"]
    assert any(len(l["prefix"]) == 1 for l in repo.t["labels"])
    v1 = r1["version"]
    members = [m for m in repo.t["table_members"] if m["version"] == v1]
    assert len(members) == 70 and len({m["table_no"] for m in members}) == r1["tables"]
    assert len([p for p in repo.t["pair_scores"] if p["version"] == v1]) == 70 * 69 // 2

    # 2. 체크인 마감 — 60명 체크인 + 현장 등록 2명. 저장된 코드북에 붙이기만
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
    r2 = service.precompute(repo, enc, reuse_codebook=True, iters=3000)
    assert not r2["new_codebook"] and r2["issued"] == 2 and r2["n"] == 62
    after = {s["participant_id"]: s["offer_sid"] for s in repo.t["sids"]}
    assert all(after[p] == before[p] for p in before)                    # 먼저 받은 주소는 그대로
    repo.t["assign_versions"][-1]["status"] = "published"                # 운영자가 공개

    # 3. 테이블토크 중 명함 교환 · 만족도 (응답률 70%)
    tab = [m for m in repo.t["table_members"] if m["version"] == r2["version"]]
    by_table = {}
    for m in tab:
        by_table.setdefault(m["table_no"], []).append(m["participant_id"])
    for g in by_table.values():
        for a in g:
            for b in g:
                if a < b:
                    repo.t["card_exchanges"].append({"scanner_id": a, "scanned_id": b})
    checked = [m["participant_id"] for m in tab]
    for pid in checked[: int(len(checked) * 0.7)]:
        repo.t["satisfaction"].append({"participant_id": pid, "round": "tabletalk", "choice": "gained"})

    # 4. 커피챗
    r3 = service.coffeechat(repo, enc, iters=5000)
    assert r3["forbid_hits"] == 0 and not r3["fallback"]                  # 테이블토크 동석자와 다시 안 앉음
    recs = [r for r in repo.t["recs"] if r["version"] == r3["version"]]
    assert len(recs) == 62 * 12
    t2 = {m["participant_id"]: m["table_no"] for m in tab}
    assert all(t2[r["participant_id"]] != t2[r["target_id"]] for r in recs)   # 이미 만난 사람은 추천 안 함
    assert repo.ops_get("compute_heartbeat")["last"] == "coffeechat"
    print(f"  전날 {r1['tables']}테이블 · 체크인 뒤 {r2['tables']}테이블(워크인 {r2['issued']}명) · 커피챗 {r3['tables']}테이블 · 추천 {len(recs)}행")


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
    assert repo.ops_get("codebook_active:dev") == r1["codebook_version"]
    assert repo.ops_get("codebook_active:other") != r1["codebook_version"]
    ids = [p["id"] for p in repo.participants("dev") if p["role"] != "staff"]
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
    repo, enc = seed_repo(n=3, n_host=0), FakeEncoder()
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
