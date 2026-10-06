"""명찰에 인쇄할 명함 QR 을 참가자마다 PNG 로 낸다 (2026-09-26).

QR 문자열은 docs/QR_FORMAT.md 의 명함 형식 `https://<앱주소>/card?p=<participant_id>` 다. 앱 안의 내 명함 화면이 보여 주는 QR 과 같다.
participant id 가 바뀌면 인쇄한 QR 이 죽으므로, 적재 스크립트(import_participants.py)는 같은 사람을 다시 넣지 않고 갱신한다.

사용법
  pip install qrcode[pil] supabase
  python scripts/export_badge_qr.py --event-id orbit-2026 --app-url https://orbit-app.vercel.app --out D:/DSL/_event_data/badges
  python scripts/export_badge_qr.py --event-id dev --app-url http://localhost:3000 --out D:/DSL/_event_data/badges_dev

결과
  <out>/<이름>_<id 앞 8자>.png   참가자별 QR (기본 600px, 여백 포함)
  <out>/index.csv                명찰번호, 테이블, 좌석, 이름, 소속, 구분, participant_id, 파일명   ← 명찰 디자인 쪽에 넘긴다. 저장소에 올리지 않는다

개발 지시서 v0.2 P-02 (2026-10-06): 명찰에 테이블 · 좌석 번호를 넣는다. 운영진이 명찰을 테이블 위에 좌석 순서대로 둔다.
  테이블 · 좌석은 테이블토크 배정 버전에서 읽는다. 기본은 공개(published) 버전, 공개 전이면 --version 으로 초안 번호를 준다.
  명찰번호는 테이블 · 좌석 순으로 1부터 매긴다. 응모권 추첨이 명찰 번호로 앱 밖에서 한다(결정 6). 배정이 없는 사람은 뒤에 이름순.

환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local 을 자동으로 읽는다).
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path


def load_env() -> None:
    p = Path(__file__).resolve().parents[1] / "apps" / "web" / ".env.local"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip()


def safe_name(s: str) -> str:
    return re.sub(r"[^\w가-힣]+", "_", s).strip("_") or "noname"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--event-id", default="dev")
    ap.add_argument("--app-url", required=True, help="배포 주소. 예: https://orbit-app.vercel.app")
    ap.add_argument("--out", required=True, help="PNG 를 낼 폴더. 저장소 밖")
    ap.add_argument("--size", type=int, default=600, help="PNG 한 변 픽셀. 기본 600")
    ap.add_argument("--include-staff", action="store_true", help="운영진도 낸다. 기본은 뺀다")
    ap.add_argument("--version", type=int, help="테이블 · 좌석을 읽을 테이블토크 배정 버전. 없으면 공개 버전")
    args = ap.parse_args()

    load_env()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요하다", file=sys.stderr)
        return 2

    import qrcode  # pip install qrcode[pil]
    from supabase import create_client  # pip install supabase

    client = create_client(url.split("/rest/")[0], key)
    q = client.table("participants").select("id, display_name, affiliation, role").eq("event_id", args.event_id).order("display_name")
    if not args.include_staff:
        q = q.neq("role", "staff")
    rows = q.execute().data or []
    if not rows:
        print(f"event_id={args.event_id} 에 참가자가 없다", file=sys.stderr)
        return 2

    # 테이블 · 좌석
    vq = client.table("assign_versions").select("version, status").eq("event_id", args.event_id).eq("round", "tabletalk")
    vq = vq.eq("version", args.version) if args.version else vq.eq("status", "published").order("version", desc=True).limit(1)
    vs = vq.execute().data or []
    seat_of: dict[str, tuple[int, int | None]] = {}
    if vs:
        tm = client.table("table_members").select("participant_id, table_no, seat_no").eq("version", vs[0]["version"]).execute().data or []
        seat_of = {m["participant_id"]: (m["table_no"], m.get("seat_no")) for m in tm}
        print(f"테이블토크 버전 {vs[0]['version']}({vs[0]['status']})의 좌석을 넣는다. 배정된 사람 {len(seat_of)}명")
    else:
        print("테이블토크 배정 버전이 없어 테이블 · 좌석 칸을 비운다", file=sys.stderr)
    rows.sort(key=lambda r: (r["id"] not in seat_of, *(seat_of.get(r["id"], (0, 0))[0], seat_of.get(r["id"], (0, 0))[1] or 999), r["display_name"]))

    base = args.app_url.rstrip("/")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for no, r in enumerate(rows, start=1):
        payload = f"{base}/card?p={r['id']}"
        img = qrcode.make(payload, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
        img = img.resize((args.size, args.size))
        fname = f"{safe_name(r['display_name'])}_{r['id'][:8]}.png"
        img.save(out / fname)
        table, seat = seat_of.get(r["id"], ("", ""))
        index.append([no, table, seat if seat is not None else "", r["display_name"], r.get("affiliation") or "", r["role"], r["id"], fname])

    with open(out / "index.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["명찰번호", "테이블", "좌석", "이름", "소속", "구분", "participant_id", "파일명"])
        w.writerows(index)
    print(f"{len(index)}명 QR 저장: {out} (index.csv 포함. 저장소에 올리지 않는다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
