"""포스터 세션: 포스터 목록 SQL, 자리별 포스터 QR, 퀴즈 SQL 을 낸다 (2026-10-19).

포스터 코드는 행사장 자리 번호다. 1번 자리 = P01, 11번 자리 = P11. 앱의 포스터 목록(/api/poster/list)은 코드 순서라 목록 번호가 자리 번호와 같다.
QR 문자열은 docs/QR_FORMAT.md 의 포스터 형식 https://<앱주소>/poster?c=<code> 다. QR 에는 코드만 들어간다.

입력
  scripts/event_posters.json   포스터 목록(공개 정보: 제목 · 발표자 · 태그 · 요약 · 발표자 이름). 저장소에 둔다
  --quizzes <파일>             퀴즈와 정답. 저장소가 공개라서 저장소 밖에 둔다. 형식은 scripts/sample_quizzes.json

결과
  supabase/event_posters.sql       포스터 목록 적재. 저장소에 커밋한다. Supabase SQL Editor 에서 먼저 실행
  <out>/qr_png/<code>.png          자리마다 QR (300dpi, 1800px)
  <out>/qr_svg/<code>.svg          같은 QR 벡터. 일러스트레이터 · PPT 에 넣을 때
  <out>/qr_label/<code>_label.png  안내 문구와 자리 번호를 붙인 타일
  <out>/poster_quizzes.sql         --quizzes 를 주면. 포스터 목록 SQL 다음에 실행. 저장소에 올리지 않는다
  <out>/index.csv                  자리, 코드, 발표, 제목, QR 주소, 퀴즈 유무

사용법
  pip install qrcode[pil]
  python scripts/build_posters.py --out D:/DSL/_event_data/poster_kit --quizzes D:/DSL/_event_data/quizzes.json
  python scripts/build_posters.py --out /tmp/poster_kit --quizzes scripts/sample_quizzes.json    형식 확인용(퀴즈 SQL 은 실행하지 않는다)

요약(summary)은 앱에서 퀴즈 버튼 바로 위에 보이므로 퀴즈 정답을 적지 않는다. 퀴즈는 보기 2개(10/5 회의).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
NAVY = (27, 36, 84)

# 지울 예전 행. 개발용 seed(supabase/seed.sql)의 가짜 포스터와, 자리 번호로 바꾸기 전(10/19) 번호로 들어간 포스터.
# 코드와 제목이 둘 다 맞을 때만 지운다(행사 중 제목을 고쳐도 응답 · 스탬프가 지워지지 않게)
STALE = [
    ("P01", "그래프 SID 생성형 추천"),
    ("P02", "구인구직 매칭 데이터셋"),
    ("P03", "시계열 이상탐지"),
    ("P04", "LLM 기반 문서 요약"),
    ("P05", "인과추론으로 본 마케팅 효과"),
    ("P01", "그래프 Semantic ID로 생성형 추천의 콜드스타트 완화"),
    ("P02", "Do MLLMs Capture How Interfaces Guide User Behavior?"),
    ("P03", "Semi-Supervised Preference Optimization with Limited Feedback"),
    ("P04", "사주명리학의 유의성에 대한 통계적 접근"),
]


def font(size: int, bold: bool = False):
    """한글 글꼴. 없으면 기본 글꼴(한글이 네모로 나올 수 있다)."""
    from PIL import ImageFont

    cands = [
        ("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0),                                     # macOS
        ("C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf", 0),         # Windows
        (f"/usr/share/fonts/opentype/noto/NotoSansCJK-{'Bold' if bold else 'Regular'}.ttc", 1),  # Linux (Noto CJK, 1 = KR)
        ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf", 0),                                 # Linux (fonts-nanum)
    ]
    for path, index in cands:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                pass
    return ImageFont.load_default()


def s(x: str) -> str:
    return "'" + x.replace("'", "''") + "'"


def arr(xs: list[str]) -> str:
    return "array[" + ",".join(s(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"


def posters_sql(posters: list[dict], event_id: str) -> str:
    codes = ",".join(s(p["code"]) for p in posters)
    L = [
        "-- 행사 포스터 목록 (scripts/build_posters.py 가 scripts/event_posters.json 으로 만든다. 직접 고치지 않는다)",
        "-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 실행한다. 여러 번 실행해도 결과가 같다.",
        "-- 코드 = 행사장 자리 번호. 퀴즈는 저장소 밖 poster_quizzes.sql 을 이 파일 다음에 실행한다.",
        f"-- presenter_ids(발표자 본인 응답을 커피챗 계산에서 뺌, docs/DATA_SPEC.md P-03)는 participants.event_id = '{event_id}' 에서 이름으로 찾는다.",
        "-- 명단 적재 전에 실행하면 빈 배열이므로 적재 뒤 한 번 더 실행한다.",
        "",
        "begin;",
        "",
        "-- 예전 행(개발용 seed 가짜 포스터, 자리 번호 전 번호). 코드와 제목이 둘 다 맞을 때만 지운다. 딸린 퀴즈 · 기록도 같이 지워진다",
        "delete from posters where (code, title) in (",
        ",\n".join(f"  ({s(c)}, {s(t)})" for c, t in STALE),
        ");",
        "",
        "insert into posters (code, title, presenter, tags, summary) values",
        ",\n".join(f"  ({s(p['code'])}, {s(p['title'])}, {s(p['presenter'])}, {arr(p['tags'])}, {s(p['summary'])})" for p in posters),
        "on conflict (code) do update set",
        "  title = excluded.title, presenter = excluded.presenter, tags = excluded.tags, summary = excluded.summary;",
        "",
    ]
    for p in posters:
        if p.get("presenter_names"):
            L.append(
                f"update posters set presenter_ids = coalesce((select array_agg(id) from participants "
                f"where event_id = {s(event_id)} and display_name = any({arr(p['presenter_names'])})), '{{}}') where code = {s(p['code'])};"
            )
    L += [
        "",
        "commit;",
        "",
        "-- 확인: 목록 순서 = 자리 번호, 발표자 id 수",
        "select code, title, presenter, cardinality(presenter_ids) as presenters, (select count(*) from poster_quizzes q where q.poster_id = posters.id) as quizzes",
        "from posters order by code;",
        "",
    ]
    return "\n".join(L)


def quizzes_sql(quizzes: list[dict]) -> str:
    codes = ",".join(s(q["code"]) for q in quizzes)
    L = [
        "-- 포스터 퀴즈 (scripts/build_posters.py 로 생성). 정답이 들어 있으므로 저장소에 올리지 않는다.",
        "-- supabase/event_posters.sql 을 먼저 실행한 뒤 SQL Editor 에서 실행한다. 여러 번 실행해도 결과가 같다.",
        "",
        "begin;",
        "",
        "-- 포스터당 1개, 이지선다. 지우고 새로 넣는다(시도 기록 quiz_attempts 는 poster_id 기준이라 남는다)",
        f"delete from poster_quizzes where poster_id in (select id from posters where code in ({codes}));",
        "insert into poster_quizzes (poster_id, question, choices, answer_index)",
        "\nunion all\n".join(
            f"  select id, {s(q['question'])}, {s(json.dumps(q['choices'], ensure_ascii=False))}::jsonb, {q['answer_index']} from posters where code = {s(q['code'])}"
            for q in quizzes
        )
        + ";",
        "",
        "commit;",
        "",
        f"-- 확인: 퀴즈 {len(quizzes)}개가 보여야 한다. 모자라면 포스터 목록 SQL 을 먼저 실행하지 않은 것이다",
        "select p.code, q.question, q.choices, q.answer_index from poster_quizzes q join posters p on p.id = q.poster_id",
        f"where p.code in ({codes}) order by p.code;",
        "",
    ]
    return "\n".join(L)


def make_qr(payload: str):
    import qrcode

    # Q(25% 복원): 인쇄물이 조금 구겨지거나 반사돼도 읽히게
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, box_size=40, border=4)
    qr.add_data(payload)
    qr.make(fit=True)
    return qr


def label_tile(qr_img, slot: int):
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="QR · 퀴즈 SQL 을 낼 폴더. 저장소 밖")
    ap.add_argument("--quizzes", help="퀴즈 JSON(정답 포함, 저장소 밖)")
    ap.add_argument("--app-url", default="https://orbit-app-dusky-theta.vercel.app", help="배포 주소")
    ap.add_argument("--event-id", default="orbit-2026", help="발표자 이름을 찾을 participants.event_id")
    ap.add_argument("--posters", default=str(HERE / "event_posters.json"))
    ap.add_argument("--sql", default=str(REPO / "supabase" / "event_posters.sql"), help="포스터 목록 SQL 경로")
    a = ap.parse_args()

    import qrcode.image.svg

    posters = json.loads(Path(a.posters).read_text(encoding="utf-8"))
    codes = [p["code"] for p in posters]
    if len(set(codes)) != len(codes) or any(p["code"] != f"P{p['slot']:02d}" for p in posters):
        raise SystemExit("코드는 자리 번호(P01 ...)와 같고 겹치지 않아야 한다")
    quizzes = json.loads(Path(a.quizzes).read_text(encoding="utf-8")) if a.quizzes else []
    for q in quizzes:
        if q["code"] not in codes:
            raise SystemExit(f"{q['code']} 가 포스터 목록에 없다")
        if len(q["choices"]) != 2 or q["answer_index"] not in (0, 1):
            raise SystemExit(f"{q['code']} 퀴즈는 보기 2개, 정답 0 또는 1 이어야 한다")
    has_quiz = {q["code"] for q in quizzes}

    Path(a.sql).write_text(posters_sql(posters, a.event_id), encoding="utf-8")

    base = a.app_url.rstrip("/")
    out = Path(a.out)
    for sub in ("qr_png", "qr_svg", "qr_label"):
        (out / sub).mkdir(parents=True, exist_ok=True)
    rows = []
    for p in posters:
        payload = f"{base}/poster?c={p['code']}"
        qr = make_qr(payload)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        img.save(out / "qr_png" / f"{p['code']}.png", dpi=(300, 300))
        qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(str(out / "qr_svg" / f"{p['code']}.svg"))
        label_tile(img, p["slot"]).save(out / "qr_label" / f"{p['code']}_label.png", dpi=(300, 300))
        rows.append([p["slot"], p["code"], p["presenter"], p["title"], payload, "있음" if p["code"] in has_quiz else "없음"])
    with open(out / "index.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["자리", "코드", "발표", "제목", "QR 주소", "퀴즈"])
        w.writerows(rows)
    if quizzes:
        (out / "poster_quizzes.sql").write_text(quizzes_sql(quizzes), encoding="utf-8")
    print(f"포스터 {len(posters)}개 → {a.sql}, QR · 퀴즈 {len(quizzes)}개 → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
