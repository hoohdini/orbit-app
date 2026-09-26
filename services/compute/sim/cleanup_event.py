"""시험용 행사(event_id) 데이터를 개발 DB 에서 지운다. 기본은 무엇을 지울지 세기만 한다.

지우는 것
  그 행사 참가자가 들어 있는 배정 버전 (assign_versions → tables_meta · table_members · pair_scores · recs 가 같이 지워짐)
  그 행사 참가자 (profiles · sids · checkins · card_exchanges · satisfaction · 스탬프 등이 같이 지워짐)
  그 행사 코드북의 라벨 · ops_state 의 codebook_active:<행사> 와 codebook:<버전>
다른 행사(dev 등)가 같이 쓴 배정 버전은 건드리지 않는다 — 구성원이 전부 이 행사 사람인 버전만 지운다.

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
    members = r._in("table_members", "version, participant_id", "participant_id", ids) if ids else []
    versions = sorted({m["version"] for m in members})
    only_mine = []
    for v in versions:
        allm = r._all(lambda: r.db.table("table_members").select("participant_id").eq("version", v))
        if all(m["participant_id"] in set(ids) for m in allm):
            only_mine.append(v)
    active = r.ops_get(f"codebook_active:{event}")
    print(f"행사 {event}: 참가자 {len(ids)}명 · 배정 버전 {only_mine} · 코드북 {active}")
    if not yes:
        print("세기만 했다. 지우려면 --yes")
        return
    if only_mine:
        r.db.table("assign_versions").delete().in_("version", only_mine).execute()
    for i in range(0, len(ids), 200):
        r.db.table("participants").delete().in_("id", ids[i:i + 200]).execute()
    if active:
        r.db.table("labels").delete().eq("codebook_version", active).execute()
        r.db.table("ops_state").delete().in_("key", [f"codebook_active:{event}", f"codebook:{active}"]).execute()
    print("지웠다")


if __name__ == "__main__":
    main()
