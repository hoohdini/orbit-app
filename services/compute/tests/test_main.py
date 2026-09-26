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


def client(n=70):
    main._repo, main._enc = seed_repo(n=n, n_host=min(8, n)), FakeEncoder()
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
    assert r.status_code == 200 and r.json()["issued"] == 70, r.text
    r = c.post("/coffeechat", json={"rec_mode": "one_way"}, headers=H)
    assert r.status_code == 200 and r.json()["fallback"], r.text
    c2 = client(n=3)
    assert c2.post("/precompute", json={}, headers=H).status_code == 409


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("통과", name)
