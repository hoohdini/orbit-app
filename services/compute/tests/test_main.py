"""진입점 시험 — 비밀값 확인 · 409 · 정상 응답. DB · 모델은 가짜로 바꿔 끼운다.

실행  cd services/compute && python tests/test_main.py   (fastapi · httpx 필요)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
os.environ["COMPUTE_SECRET"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from test_service import FakeEncoder, seed_repo  # noqa: E402

H = {"X-Compute-Secret": "test-secret"}


def client(n=70, n_staff=2):
    main._repo, main._enc = seed_repo(n=n, n_host=min(8, n), n_staff=n_staff), FakeEncoder()
    return TestClient(main.app)


def test_secret():
    c = client()
    assert c.get("/health").json()["ok"]
    assert c.post("/precompute", json={}).status_code == 401
    assert c.post("/precompute", json={}, headers={"X-Compute-Secret": "wrong"}).status_code == 401


def test_flow_and_conflict():
    c = client()
    r = c.post("/coffeechat", json={}, headers=H)
    assert r.status_code == 409                                     # 주소가 없는데 커피챗 → 409
    r = c.post("/precompute", json={"table_mode": "avg"}, headers=H)
    assert r.status_code == 200 and r.json()["issued"] == 72, r.text   # 참가자 70 + 운영진 2
    r = c.post("/coffeechat", json={"rec_mode": "one_way"}, headers=H)
    assert r.status_code == 200 and r.json()["fallback"], r.text
    r = c.post("/search", json={"q": "추천시스템"}, headers=H)
    assert r.status_code == 200 and "people" in r.json(), r.text                 # 뜻 검색(시제품)
    assert c.post("/search", json={"q": "추"}, headers=H).status_code == 422     # 한 글자 거절
    c2 = client(n=3, n_staff=0)
    assert c2.post("/precompute", json={}, headers=H).status_code == 409


def test_coffeechat_late():
    """커피챗 공개 뒤 늦게 온 사람 자리(10/25): 비밀값 · 공개 전 409 · 공개 뒤 자리."""
    c = client(n=40, n_staff=0)
    pid = main._repo.t["participants"][0]["id"]
    assert c.post("/coffeechat/late", json={"participant_id": pid}).status_code == 401
    assert c.post("/coffeechat/late", json={"participant_id": pid}, headers=H).status_code == 409   # 공개된 커피챗 없음
    assert c.post("/precompute", json={}, headers=H).status_code == 200
    late = main._repo.t["participants"][-1]["id"]
    main._repo.t["checkins"] += [{"participant_id": p["id"]} for p in main._repo.t["participants"] if p["id"] != late]
    v = c.post("/coffeechat", json={}, headers=H).json()["version"]
    next(x for x in main._repo.t["assign_versions"] if x["version"] == v)["status"] = "published"
    r = c.post("/coffeechat/late", json={"participant_id": late, "version": v}, headers=H)
    assert r.status_code == 200 and r.json()["reason"]["late_join"] and r.json()["seat_no"] >= 2, r.text


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
