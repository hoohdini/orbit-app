"""포스터 세션 자리별 포스터 QR 과 포스터 · 퀴즈 적재 SQL 을 한 번에 낸다 (2026-10-19).

포스터 코드는 행사장 자리 번호다. 1번 자리 = P01, 11번 자리 = P11. 자리표는 scripts/poster_positions.json 이다.
QR 문자열은 docs/QR_FORMAT.md 의 포스터 형식 https://<앱주소>/poster?c=<code> 다. QR 에는 코드만 들어가므로
QR 을 먼저 인쇄하고 제목 · 요약 · 퀴즈는 나중에 SQL 로 넣거나 고쳐도 된다.

포스터 내용 파일(posters.json)에는 퀴즈 정답이 들어간다. 저장소가 공개라서 이 파일과 결과 SQL 은 저장소 밖에 둔다.
형식은 scripts/sample_posters.json 을 본다. 포스터가 새로 들어오면 내용 파일에 항목을 더하고 다시 돌린다.

사용법
  pip install qrcode[pil]
  python scripts/build_posters.py --data D:/DSL/_event_data/posters.json --out D:/DSL/_event_data/poster_kit
  python scripts/build_posters.py --data scripts/sample_posters.json --out /tmp/poster_kit     형식 확인용

결과
  <out>/qr_png/<code>.png          자리마다 QR (300dpi, 1800px). 자리표의 11자리 전부
  <out>/qr_svg/<code>.svg          같은 QR 벡터. 일러스트레이터 · PPT 에 넣을 때
  <out>/qr_label/<code>_label.png  안내 문구와 자리 번호를 붙인 타일. 포스터에 그대로 붙일 때
  <out>/posters_quiz.sql           Supabase SQL Editor 에 붙여 실행. 여러 번 실행해도 결과가 같다
  <out>/index.csv                  자리, 코드, 발표, 제목, QR 주소, 등록 여부, 퀴즈, 정답

내용 파일 항목: code, title, presenter, presenter_names(발표자 본인 응답을 빼는 데 씀, docs/DATA_SPEC.md P-03),
tags, summary(포스터 화면의 요약. 퀴즈 버튼 바로 위에 보이므로 정답을 적지 않는다), question, choices(2개, 10/5 회의),
answer_index(0 또는 1), evidence(정답 근거, SQL 에는 들어가지 않음)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAVY = (27, 36, 84)


def font(size: int, bold: bool = False):
    """한글 글꼴. 없으면 기본 글꼴(한글이 네모로 나올 수 있다)."""
    from PIL import ImageFont

    cands = [
        ("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0),                                   # macOS
        ("C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf", 0),       # Windows
        (f"/usr/share/fonts/opentype/noto/NotoSansCJK-{'Bold' if bold else 'Regular'}.ttc", 1),  # Linux (Noto CJK, 1 = KR)
        ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf", 0),                               # Linux (fonts-nanum)
    ]
    for path, index in cands:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                pass
    return ImageFont.load_default()


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql_arr(xs: list[str]) -> str:
    return "array[" + ",".join(sql_str(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"


def make_qr(payload: str):
    import qrcode

    # Q(25% 복원): 인쇄물이 조금 구겨지거나 반사돼도 읽히게. 문자열이 짧아 칸 수는 그대로다
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, box_size=40, border=4)
    qr.add_data(payload)
    qr.make(fit=True)
    return qr


def label_tile(qr_img, slot: int):
    """안내 문구 + QR + 자리 번호 타일."""
    from PIL import Image, ImageDraw

    W = 1600
    tile = Image.new("RGB", (W, 2000), "white")
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle((20, 20, W - 20, 1980), radius=80, outline=NAVY, width=12)
    d.text((W / 2, 175), "포스터 퀴즈", fill=NAVY, font=font(120, True), anchor="mm")
    d.text((W / 2, 300), "QR을 찍고 퀴즈를 맞히면 스탬프 1개", fill=(70, 70, 70), font=font(64), anchor="mm")
    tile.paste(qr_img.resize((1400, 1400), Image.NEAREST), (100, 370))
    d.text((W / 2, 1855), f"ORBIT.app · {slot}번 포스터", fill=NAVY, font=font(72, True), anchor="mm")
    return tile


def build_sql(posters: list[dict], event_id: str) -> str:
    codes = ",".join(sql_str(p["code"]) for p in posters)
    L = [
        "-- ORBIT.app 포스터 세션: 포스터 · 퀴즈 적재 (scripts/build_posters.py 로 생성)",
        "-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 실행한다. 여러 번 실행해도 결과가 같다.",
        f"-- presenter_ids 는 participants.event_id = '{event_id}' 에서 이름으로 찾는다. 명단 적재 전이면 빈 배열이므로 적재 뒤 한 번 더 실행한다.",
        "",
        "begin;",
        "",
        "-- 같은 포스터가 다른 코드로 들어가 있으면 지운다(코드를 자리 번호로 바꾼 경우)",
        f"delete from posters where title in ({','.join(sql_str(p['title']) for p in posters)}) and code not in ({codes});",
        "",
        "insert into posters (code, title, presenter, tags, summary) values",
        ",\n".join(
            f"  ({sql_str(p['code'])}, {sql_str(p['title'])}, {sql_str(p['presenter'])}, {sql_arr(p['tags'])}, {sql_str(p['summary'])})"
            for p in posters
        ),
        "on conflict (code) do update set",
        "  title = excluded.title, presenter = excluded.presenter, tags = excluded.tags, summary = excluded.summary;",
        "",
        "-- 발표자 본인 응답은 커피챗 계산에서 뺀다(docs/DATA_SPEC.md P-03)",
    ]
    for p in posters:
        names = p.get("presenter_names") or []
        if names:
            L.append(
                f"update posters set presenter_ids = coalesce((select array_agg(id) from participants "
                f"where event_id = {sql_str(event_id)} and display_name = any({sql_arr(names)})), '{{}}') where code = {sql_str(p['code'])};"
            )
    L += [
        "",
        "-- 퀴즈는 포스터당 1개, 이지선다. 지우고 새로 넣는다(시도 기록 quiz_attempts 는 poster_id 기준이라 남는다)",
        f"delete from poster_quizzes where poster_id in (select id from posters where code in ({codes}));",
        "insert into poster_quizzes (poster_id, question, choices, answer_index)",
        "\nunion all\n".join(
            f"  select id, {sql_str(p['question'])}, {sql_str(json.dumps(p['choices'], ensure_ascii=False))}::jsonb, {p['answer_index']} "
            f"from posters where code = {sql_str(p['code'])}"
            for p in posters
        )
        + ";",
        "",
        "commit;",
        "",
        "-- 확인",
        "select p.code, p.title, cardinality(p.presenter_ids) as presenters, q.question, q.choices, q.answer_index",
        f"from posters p left join poster_quizzes q on q.poster_id = p.id where p.code in ({codes}) order by p.code;",
        "",
        "-- 개발용 seed(supabase/seed.sql)를 넣었던 DB 면 가짜 포스터가 남는다. 지우려면:",
        "-- delete from posters where (code, title) in (('P02','구인구직 매칭 데이터셋'),('P03','시계열 이상탐지'),('P05','인과추론으로 본 마케팅 효과'));",
        "",
    ]
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="포스터 내용 JSON(퀴즈 정답 포함, 저장소 밖)")
    ap.add_argument("--out", required=True, help="결과 폴더. 저장소 밖")
    ap.add_argument("--app-url", default="https://orbit-app-dusky-theta.vercel.app", help="배포 주소")
    ap.add_argument("--event-id", default="orbit-2026", help="발표자 이름을 찾을 participants.event_id")
    ap.add_argument("--positions", default=str(HERE / "poster_positions.json"), help="자리표")
    a = ap.parse_args()

    import qrcode.image.svg

    positions = json.loads(Path(a.positions).read_text(encoding="utf-8"))
    posters = json.loads(Path(a.data).read_text(encoding="utf-8"))
    known = {p["code"] for p in positions}
    for p in posters:
        if p["code"] not in known:
            raise SystemExit(f"{p['code']} 가 자리표에 없다")
        if len(p["choices"]) != 2 or p["answer_index"] not in (0, 1):
            raise SystemExit(f"{p['code']} 퀴즈는 보기 2개, 정답 0 또는 1 이어야 한다")
    content = {p["code"]: p for p in posters}

    base = a.app_url.rstrip("/")
    out = Path(a.out)
    for sub in ("qr_png", "qr_svg", "qr_label"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    rows = []
    for pos in positions:
        code = pos["code"]
        payload = f"{base}/poster?c={code}"
        qr = make_qr(payload)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        img.save(out / "qr_png" / f"{code}.png", dpi=(300, 300))
        qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(str(out / "qr_svg" / f"{code}.svg"))
        label_tile(img, pos["slot"]).save(out / "qr_label" / f"{code}_label.png", dpi=(300, 300))
        p = content.get(code)
        if p:
            rows.append([pos["slot"], code, pos["who"], p["title"], payload, "등록", p["question"], " / ".join(p["choices"]), p["choices"][p["answer_index"]]])
        else:
            rows.append([pos["slot"], code, pos["who"], "", payload, "내용 없음", "", "", ""])

    with open(out / "index.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["자리", "코드", "발표", "제목", "QR 주소", "DB", "퀴즈", "보기", "정답"])
        w.writerows(rows)
    if posters:
        (out / "posters_quiz.sql").write_text(build_sql(posters, a.event_id), encoding="utf-8")
    print(f"QR {len(positions)}자리, 내용 {len(posters)}개: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
