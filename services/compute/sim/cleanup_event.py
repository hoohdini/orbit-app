"""시험용 행사(event_id) 데이터를 개발 DB 에서 지운다. 기본은 무엇을 지울지 세기만 한다.

지우는 것
  그 행사의 배정 버전 (assign_versions.event_id → tables_meta · table_members · pair_scores · recs 가 같이 지워짐)
  그 행사 참가자 (profiles · sids · checkins · card_exchanges · satisfaction · 스탬프 등이 같이 지워짐)
  그 행사 코드북(codebooks)과 라벨. 0007 전에 ops_state 에 넣었던 codebook_active:<행사> · codebook:<버전> 도 남아 있으면 지운다

실행  python sim/cleanup_event.py sim-minchan            세기만
      python sim/cleanup_event.py sim-minchan --yes      실제로 지우기
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from repo import SupabaseRepo  # noqa: E402

PROTECTED = {"dev", "orbit-2026"}               # 실수로 진짜 행사를 지우지 않게


def load_env():
    p = Path(__file__).resolve().parents[1] / ".env"
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).split(" #")[0].strip())


def main():
    event, yes = sys.argv[1], "--yes" in sys.argv
    if event in PROTECTED:
        sys.exit(f"{event} 는 지우지 않는다")
    load_env()
    r = SupabaseRepo()
    ids = [p["id"] for p in r.participants(event)]
    versions = [v["version"] for v in r._all(lambda: r.db.table("assign_versions").select("version").eq("event_id", event))]
    books = [c["version"] for c in r._all(lambda: r.db.table("codebooks").select("version").eq("event_id", event))]
    legacy = r.ops_get(f"codebook_active:{event}")
    if legacy and legacy not in books:
        books.append(legacy)
    print(f"행사 {event}: 참가자 {len(ids)}명 · 배정 버전 {versions} · 코드북 {books}")
    if not yes:
        print("세기만 했다. 지우려면 --yes")
        return
    if versions:
        r.db.table("assign_versions").delete().in_("version", versions).execute()
    for i in range(0, len(ids), 200):
        r.db.table("participants").delete().in_("id", ids[i:i + 200]).execute()
    for b in books:
        r.db.table("labels").delete().eq("codebook_version", b).execute()
    r.db.table("codebooks").delete().eq("event_id", event).execute()
    r.db.table("ops_state").delete().in_("key", [f"codebook_active:{event}"] + [f"codebook:{b}" for b in books]).execute()
    print("지웠다")


if __name__ == "__main__":
    main()
