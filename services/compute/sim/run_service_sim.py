"""가상 70명 CSV 로 service.py 를 한 바퀴 — 실제 e5 모델, DB 대신 MemoryRepo.

DB 초대가 오면 MemoryRepo 를 SupabaseRepo 로 바꾸는 것만 남는다(--supabase).
순서: 전날 precompute → 58명 체크인 + 현장 등록 2명 → precompute(reuse) → 공개 → 명함 교환 · 만족도(합성) → coffeechat

실행  python sim/run_service_sim.py sim/fake_70.csv
"""
from __future__ import annotations

import csv
import os
import random
import sys
import time
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import service  # noqa: E402
from repo import MemoryRepo  # noqa: E402

ROLE = {"재학생": "student", "졸업생": "alumni", "교수": "professor", "운영진": "staff"}
tags = lambda v: [t for t in (v or "").split(";") if t]


def load(repo, path):
    for r in csv.DictReader(open(path, encoding="utf-8")):
        pid = str(uuid.uuid4())
        repo.t["participants"].append({"id": pid, "event_id": "dev", "display_name": r["이름"], "role": ROLE[r["구분"]],
                                       "cohort": int(r["기수"]) if r["기수"] else None, "is_host": r["호스트"] == "예"})
        repo.t["profiles"].append({"participant_id": pid, "offer_text": r["하는일"], "seek_text": r["찾는사람"],
                                   "topic_tags": tags(r["주제태그"]), "intent_tags": tags(r["관계태그"])})


def main(path):
    from pipeline.embed import Encoder
    rng = random.Random(5)
    repo = MemoryRepo()
    load(repo, path)
    t = time.time()
    enc = Encoder()
    print(f"모델 로드 {time.time()-t:.1f}초")

    t = time.time()
    r1 = service.precompute(repo, enc)
    print(f"전날 precompute {time.time()-t:.1f}초 · {r1}")

    ppl = [p for p in repo.t["participants"] if p["role"] != "staff"]
    for p in rng.sample(ppl, 58):
        repo.t["checkins"].append({"participant_id": p["id"]})
    for k in range(2):
        pid = str(uuid.uuid4())
        repo.t["participants"].append({"id": pid, "event_id": "dev", "display_name": f"현장{k}", "role": "student",
                                       "cohort": 14, "is_host": False})
        repo.t["profiles"].append({"participant_id": pid, "offer_text": "추천시스템 수업 프로젝트를 했다\n파이썬을 쓴다",
                                   "seek_text": "추천 현업자를 만나고 싶다", "topic_tags": ["추천시스템"], "intent_tags": ["멘토링"]})
        repo.t["checkins"].append({"participant_id": pid})
    t = time.time()
    r2 = service.precompute(repo, enc, reuse_codebook=True)
    print(f"체크인 마감 precompute {time.time()-t:.1f}초 · {r2}")
    repo.t["assign_versions"][-1]["status"] = "published"

    tab = [m for m in repo.t["table_members"] if m["version"] == r2["version"]]
    groups = {}
    for m in tab:
        groups.setdefault(m["table_no"], []).append(m["participant_id"])
    for g in groups.values():
        for a in g:
            for b in g:
                if a != b and rng.random() < 0.6:
                    repo.t["card_exchanges"].append({"scanner_id": a, "scanned_id": b})
    for m in tab:
        if rng.random() < 0.6:
            repo.t["satisfaction"].append({"participant_id": m["participant_id"], "round": "tabletalk", "choice": "gained"})

    t = time.time()
    r3 = service.coffeechat(repo, enc)
    print(f"커피챗 {time.time()-t:.1f}초 · {r3}")
    labels = [l for l in repo.t["labels"] if len(l["prefix"]) == 1]
    print("1층 라벨:", ", ".join(f"{l['prefix'][0]}={l['label']}" for l in sorted(labels, key=lambda l: l["prefix"])))
    ok = r3["forbid_hits"] == 0 and r2["cohort_over"] == 0
    print("판정:", "통과" if ok else "제약 위반 있음")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sim/fake_70.csv")
