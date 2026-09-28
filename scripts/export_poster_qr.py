"""포스터 앞에 붙일 포스터 QR 을 포스터마다 PNG 로 낸다 (2026-09-29).

QR 문자열은 docs/QR_FORMAT.md 의 포스터 형식 `https://<앱주소>/poster?c=<poster_code>` 다.
폰 기본 카메라로 찍으면 앱의 퀴즈 화면이 열리고, 앱 안의 스탬프판 · 명함 스캔 화면에서 찍어도 같은 주소로 간다.
export_badge_qr.py 와 같은 방식이고, 포스터 목록은 DB 의 posters 표에서 읽는다. DB 없이 시험할 때는 --codes 로 코드만 넘긴다.

사용법
  pip install qrcode[pil] supabase
  python scripts/export_poster_qr.py --app-url https://orbit-app-dusky-theta.vercel.app --out D:/DSL/_event_data/posters
  python scripts/export_poster_qr.py --app-url http://192.168.0.10:3000 --out /tmp/posters_dev          같은 와이파이의 개발 서버로
  python scripts/export_poster_qr.py --app-url http://localhost:3000 --out /tmp/posters --codes P01,P02  DB 없이 코드만으로

결과
  <out>/<code>.png      포스터별 QR (기본 600px). --label 을 주면 아래에 코드 · 제목 · 부스를 같이 그린다
  <out>/sheet.png       전부 세로로 이어 붙인 한 장. 화면에 띄우고 폰으로 찍어 보는 데모용
  <out>/index.csv       코드, 제목, 발표자, 부스, 파일명   ← 인쇄 · 부스 배치 쪽에 넘긴다

환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local 을 자동으로 읽는다). --codes 를 쓰면 필요 없다.
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


def fetch_posters() -> list[dict]:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요하다. DB 없이 내려면 --codes 를 쓴다", file=sys.stderr)
        sys.exit(2)
    from supabase import create_client  # pip install supabase

    client = create_client(url.split("/rest/")[0], key)
    return client.table("posters").select("code, title, presenter, booth").order("code").execute().data or []


def korean_font(size: int):
    """제목을 그릴 한글 글꼴. 없으면 기본 글꼴(한글이 네모로 나올 수 있다)."""
    from PIL import ImageFont

    for p in (
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",            # macOS
        "C:/Windows/Fonts/malgun.ttf",                            # Windows
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",        # Linux (fonts-nanum)
    ):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--app-url", required=True, help="배포 주소. 예: https://orbit-app-dusky-theta.vercel.app")
    ap.add_argument("--out", required=True, help="PNG 를 낼 폴더. 저장소 밖")
    ap.add_argument("--codes", help="DB 대신 쓸 포스터 코드 목록. 예: P01,P02,P03")
    ap.add_argument("--size", type=int, default=600, help="QR 한 변 픽셀. 기본 600")
    ap.add_argument("--label", action="store_true", help="QR 아래에 코드 · 제목 · 부스를 같이 그린다")
    args = ap.parse_args()

    import qrcode  # pip install qrcode[pil]
    from PIL import Image, ImageDraw

    load_env()
    if args.codes:
        posters = [{"code": c.strip(), "title": "", "presenter": "", "booth": ""} for c in args.codes.split(",") if c.strip()]
    else:
        posters = fetch_posters()
    if not posters:
        print("포스터가 없다", file=sys.stderr)
        return 2

    base = args.app_url.rstrip("/")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    big, small = korean_font(28), korean_font(18)
    tiles, index = [], []
    for p in posters:
        payload = f"{base}/poster?c={p['code']}"
        img = qrcode.make(payload, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4).convert("RGB")
        img = img.resize((args.size, args.size))
        if args.label:
            tile = Image.new("RGB", (args.size, args.size + 90), "white")
            tile.paste(img, (0, 0))
            d = ImageDraw.Draw(tile)
            d.text((16, args.size + 4), f"{p['code']}  {p.get('title') or ''}".strip(), fill="black", font=big)
            d.text((16, args.size + 46), f"부스 {p.get('booth') or '-'}  {payload}", fill="gray", font=small)
            img = tile
        fname = f"{p['code']}.png"
        img.save(out / fname)
        tiles.append(img)
        index.append([p["code"], p.get("title") or "", p.get("presenter") or "", p.get("booth") or "", fname])

    sheet = Image.new("RGB", (max(t.width for t in tiles), sum(t.height for t in tiles)), "white")
    y = 0
    for t in tiles:
        sheet.paste(t, (0, y))
        y += t.height
    sheet.save(out / "sheet.png")

    with open(out / "index.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["코드", "제목", "발표자", "부스", "파일명"])
        w.writerows(index)
    print(f"{len(index)}개 포스터 QR 저장: {out} (sheet.png · index.csv 포함)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
