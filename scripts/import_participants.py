"""사전 등록 CSV 를 participants·profiles 에 적재한다 (2026-09-25).

로그인 숫자 4자리는 휴대폰 번호 뒤 4자리로 정해 bcrypt 해시만 저장한다. 휴대폰 번호 원문은 DB·로그·출력 어디에도 남기지 않는다.
휴대폰이 비어 있으면 무작위 4자리를 만들어 --pin-out 파일(저장소 밖)에 이름과 함께 적는다. 운영진이 그 파일로 개별 안내한다.

사용법
  python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out D:/DSL/_event_data/pins.csv
  python scripts/import_participants.py 명단.csv --dry-run          # DB 에 쓰지 않고 요약만
  python scripts/import_participants.py 명단.csv --names-only       # 이름·소속·구분·기수만(명찰 QR 인쇄용 id 발급). 숫자·프로필은 나중에

같은 사람(event_id + 이름 + 소속)이 이미 있으면 새로 만들지 않고 갱신한다(2026-09-26). 명찰에 인쇄한 명함 QR 이 participant id 를 담으므로
다시 돌려도 id 가 바뀌면 안 된다. 기존 사람의 숫자 4자리는 휴대폰 열이 있을 때만 다시 계산하고, 비어 있으면 그대로 둔다(무작위를 두 번 주지 않는다).

CSV 열 (첫 줄 헤더, UTF-8). 열 이름은 아래와 같거나 --map 으로 바꾼다.
  이름, 소속, 구분, 기수, 휴대폰, 하는일, 찾는사람, 주제태그, 관계태그, 호스트
  구분: 재학생 | 졸업생 | 교수 | 운영진 | 기타          태그: 세미콜론(;) 또는 쉼표로 구분
  호스트: 예/아니오 (비면 졸업생·교수는 예)

운영자(is_admin)는 아래 OPERATORS 명단으로 정한다(2026-09-29). 명단에 있는 이름은 is_admin 을 켜고, 없는 이름은 끈다.
명단은 docs/OPERATORS.md 와 같이 고치고, 고치는 사람은 성하다.

환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local 을 자동으로 읽는다).
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import secrets
import sys
from pathlib import Path

ROLE_MAP = {"재학생": "student", "학생": "student", "졸업생": "alumni", "알럼나이": "alumni", "교수": "professor", "교수·연구자": "professor", "운영진": "staff", "기타": "other"}
OPERATORS = ("박성하", "황수민", "김민찬", "김나혜", "김현희")
DEFAULT_COLS = {"name": "이름", "affiliation": "소속", "role": "구분", "cohort": "기수", "phone": "휴대폰", "offer": "하는일", "seek": "찾는사람", "topic": "주제태그", "intent": "관계태그", "host": "호스트"}


def load_env() -> None:
    p = Path(__file__).resolve().parents[1] / "apps" / "web" / ".env.local"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip()


def split_tags(v: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;,]", v or "") if t.strip()]


def last4(phone: str) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-4:] if len(digits) >= 4 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--event-id", default="dev")
    ap.add_argument("--pin-out", help="무작위 숫자를 받은 사람의 이름·숫자 목록. 저장소 밖 경로")
    ap.add_argument("--map", action="append", default=[], help="열 이름 바꾸기. 예: --map phone=전화번호")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--names-only", action="store_true", help="이름·소속·구분·기수·호스트만 적재한다. 숫자와 프로필은 넣지 않는다")
    args = ap.parse_args()

    cols = dict(DEFAULT_COLS)
    for m in args.map:
        k, v = m.split("=", 1)
        cols[k] = v

    load_env()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run and (not url or not key):
        print("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요하다", file=sys.stderr)
        return 2

    import bcrypt  # pip install bcrypt

    rows = list(csv.DictReader(open(args.csv, encoding="utf-8-sig")))
    if not rows:
        print("CSV 가 비어 있다", file=sys.stderr)
        return 2
    missing = [c for c in (cols["name"], cols["role"]) if c not in rows[0]]
    if missing:
        print(f"CSV 에 열이 없다: {missing}. --map 으로 이름을 맞춘다", file=sys.stderr)
        return 2

    participants, profiles, random_pins = [], [], []
    for i, r in enumerate(rows, start=2):
        name = (r.get(cols["name"]) or "").strip()
        if not name:
            print(f"{i}행: 이름이 비어 건너뛴다", file=sys.stderr)
            continue
        role = ROLE_MAP.get((r.get(cols["role"]) or "").strip(), "other")
        pin = None if args.names_only else last4(r.get(cols["phone"], ""))
        pin_from_phone = pin is not None
        host_raw = (r.get(cols["host"]) or "").strip()
        is_host = host_raw in ("예", "y", "Y", "true", "1") if host_raw else role in ("alumni", "professor")
        cohort_raw = re.sub(r"\D", "", r.get(cols["cohort"], "") or "")
        participants.append(
            {
                "event_id": args.event_id,
                "display_name": name,
                "affiliation": (r.get(cols["affiliation"]) or "").strip() or None,
                "role": role,
                "cohort": int(cohort_raw) if cohort_raw else None,
                "is_host": is_host,
                "is_admin": name in OPERATORS,
                # 숫자는 DB 를 본 뒤 정한다(기존 사람이면 유지). 아래 _pin 은 적재 직전에 뺀다
                "_pin": pin,
                "_pin_from_phone": pin_from_phone,
            }
        )
        profiles.append(
            {
                "offer_text": (r.get(cols["offer"]) or "").strip()[:120],
                "seek_text": (r.get(cols["seek"]) or "").strip()[:120],
                "topic_tags": split_tags(r.get(cols["topic"], "")),
                "intent_tags": split_tags(r.get(cols["intent"], "")),
            }
        )

    roles = {}
    for p in participants:
        roles[p["role"]] = roles.get(p["role"], 0) + 1
    print(f"읽음 {len(participants)}명 · 구분 {roles} · 호스트 {sum(p['is_host'] for p in participants)}명 · 운영자 {sum(p['is_admin'] for p in participants)}명")
    absent = [n for n in OPERATORS if n not in {p["display_name"] for p in participants}]
    if absent:
        print(f"운영자 명단에 있는데 CSV 에 없는 사람: {absent}. 콘솔을 쓰려면 CSV 에 넣고 다시 돌린다", file=sys.stderr)
    dup = {}
    for p in participants:
        dup[p["display_name"]] = dup.get(p["display_name"], 0) + 1
    same = [n for n, c in dup.items() if c > 1]
    if same:
        print(f"동명이인 {len(same)}건: {same} (소속으로 구분된다)")
    key_of = lambda p: (p["display_name"], p["affiliation"] or "")
    keys = {}
    for p in participants:
        keys[key_of(p)] = keys.get(key_of(p), 0) + 1
    clash = [k for k, c in keys.items() if c > 1]
    if clash:
        print(f"이름과 소속이 모두 같은 사람이 {len(clash)}건 있다: {clash}. 구분할 수 없으니 CSV 에서 소속을 다르게 적고 다시 돌린다", file=sys.stderr)
        return 2

    # 기존 사람 조회(dry-run 이 아닐 때). id 를 유지하려고 event_id + 이름 + 소속으로 맞춘다
    existing = {}
    if not args.dry_run:
        from supabase import create_client  # pip install supabase

        client = create_client(url.split("/rest/")[0], key)
        rows_db = client.table("participants").select("id, display_name, affiliation, login_pin_hash").eq("event_id", args.event_id).execute().data or []
        existing = {(r["display_name"], r["affiliation"] or ""): r for r in rows_db}

    # 숫자 결정. 새 사람: 휴대폰 뒤 4자리, 없으면 무작위. 기존 사람: 휴대폰이 있으면 다시 계산, 없으면 유지
    for p in participants:
        old = existing.get(key_of(p))
        pin = p.pop("_pin")
        from_phone = p.pop("_pin_from_phone")
        if args.names_only:
            continue
        if pin is None and old and old.get("login_pin_hash"):
            continue  # 기존 숫자 유지
        if pin is None:
            pin = f"{secrets.randbelow(10000):04d}"
            random_pins.append((p["display_name"], p["affiliation"] or "", pin))
        p["login_pin_hash"] = bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=10)).decode()
        del from_phone
    if not args.names_only:
        print(f"무작위 숫자 {len(random_pins)}명")

    if args.pin_out and random_pins:
        out = Path(args.pin_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(["이름", "소속", "숫자"])
            w.writerows(random_pins)
        print(f"무작위 숫자 목록 저장: {out} (저장소에 올리지 않는다)")
    elif random_pins:
        print("무작위 숫자를 받은 사람이 있는데 --pin-out 이 없다. 이 실행에서는 숫자를 알 수 없으니 --pin-out 을 주고 다시 돌린다", file=sys.stderr)
        if not args.dry_run:
            return 2

    if args.dry_run:
        print("dry-run: DB 에 쓰지 않았다")
        return 0

    inserted = updated = 0
    for p, pr in zip(participants, profiles):
        old = existing.get(key_of(p))
        if old:
            client.table("participants").update(p).eq("id", old["id"]).execute()
            pid = old["id"]
            updated += 1
        else:
            res = client.table("participants").insert(p).execute()
            pid = res.data[0]["id"]
            inserted += 1
        if not args.names_only:
            client.table("profiles").upsert({"participant_id": pid, **pr}, on_conflict="participant_id").execute()
    print(f"적재 완료: 새로 {inserted}명 · 갱신 {updated}명 (event_id={args.event_id}{', 이름만' if args.names_only else ''})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
