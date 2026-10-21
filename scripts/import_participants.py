"""사전 등록 CSV 를 participants·profiles 에 적재한다 (2026-09-25).

로그인 숫자 4자리는 휴대폰 번호 뒤 4자리로 정해 bcrypt 해시만 저장한다. 휴대폰 번호 원문은 DB·로그·출력 어디에도 남기지 않는다.
휴대폰이 비어 있으면 무작위 4자리를 만들어 --pin-out 파일(저장소 밖)에 이름과 함께 적는다. 운영진이 그 파일로 개별 안내한다.

사용법
  python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out D:/DSL/_event_data/pins.csv
  python scripts/import_participants.py 명단.csv --dry-run          # DB 에 쓰지 않고 요약만
  python scripts/import_participants.py 명단.csv --names-only       # 이름·소속·구분·기수만(명찰 QR 인쇄용 id 발급). 숫자·프로필은 나중에
  python scripts/import_participants.py 명단.csv --event-id orbit-2026 --pin-out 저장소밖/pins.csv \
      --fixed-names 저장소밖/table1.txt --exclude "배소윤,박현진"     # 10/31 행사 명단(10/21 민찬 결정)

1번 테이블 고정(--fixed-names, 10/21 민찬 결정). 구글폼 CSV 에는 고정테이블 열도 운영진 구분도 없어서 이름으로 정한다.
  행사장 10테이블 중 1번 = 운영진 7 + 연사 교수 3 = 10명. 나머지는 계산 서비스가 2~10번에 고르게 앉힌다.
  값은 쉼표 목록("이름1,이름2,...") 또는 이름을 줄마다(또는 쉼표로) 적은 텍스트 파일 경로. 이름은 표시 이름과 글자까지 같아야 맞는다.
  주면 이 목록이 기준이다: 목록에 있는 사람은 fixed_table 1, 없는 사람은 비운다(예전 적재의 고정이 남지 않게. 고정테이블 열에 1 이 있으면 그 사람도 1).
  CSV 에 없는 이름은 줄마다 알리고, 최종 고정 인원을 찍는다. 10명이 아니면 경고한다(계산 서비스 FIXED_TABLE_MAX = 10, 넘으면 fixed_over).
  --names-only · --dry-run 과 같이 쓸 수 있다(dry-run 은 DB 에 쓰지 않고 인원만 찍는다)
명단에서 빼기(--exclude, 10/21 민찬 결정). 오지 않는 사람을 이름으로 빼고 적재한다. 값 형식은 --fixed-names 와 같다.
  뺀 사람과 CSV 에 없는 이름을 찍는다. 이미 DB 에 들어간 사람은 지우지 않는다(계산 서비스가 그 사람도 앉히므로, DB 에 있으면 경고한다)

같은 사람(event_id + 이름 + 소속)이 이미 있으면 새로 만들지 않고 갱신한다(2026-09-26). 명찰에 인쇄한 명함 QR 이 participant id 를 담으므로
다시 돌려도 id 가 바뀌면 안 된다. 기존 사람의 숫자 4자리는 휴대폰 열이 있을 때만 다시 계산하고, 비어 있으면 그대로 둔다(무작위를 두 번 주지 않는다).

CSV 열 (첫 줄 헤더, UTF-8). 열 이름은 아래와 같거나 --map 으로 바꾼다.
  이름, 소속, 구분, 기수, 휴대폰, 하는일, 찾는사람, 주제태그, 관계태그, 호스트, 고정테이블, 활동팀
  구분: 재학생 | 졸업생 | 교수 | 운영진 | 기타          태그: 세미콜론(;) 또는 쉼표로 구분
  호스트: 예/아니오 (비면 졸업생·교수는 예)
  활동팀: 같이 한 프로젝트 · 스터디 팀 이름(; 로 구분, 예: 25-2 추천시스템;26-1 LLM 스터디). 같은 팀이었으면 추천에서 뒤로 미룬다. 열이 없으면 기존 값을 지우지 않는다
  고정테이블: 1(교수 · 운영진석) 또는 빈칸. 비우면 계산 서비스가 배정한다. 열이 없는 CSV 로 다시 적재해도 기존 값을 지우지 않는다(2026-10-05, 0008)

10/17 구글폼(자유 문장 없음)용 열 — 셋 다 없어도 된다(예전 명단 그대로 적재). 하나라도 있으면 구분(경력, 0015)을 정한다
  재직: 정규직 | 인턴(회사) | 학부연구생(연구실 인턴) | 재직 중 아님(비어도 아님). 직책: 직책 · 직무명(예: 데이터 분석가, 석사과정). 관심도메인: 관심 도메인 체크(; 로 구분)
  구분(경력) career = 교수 → professor, 재직 또는 직책에 학부연구생 · 연구실 · 랩 인턴 → lab_intern, 재직(정규직 · 인턴) → employed,
  직책에 석사 · 박사 · 대학원 → grad, 그 밖 → student. 연구실 인턴을 회사 인턴(재직)보다 먼저 가른다
  하는일 = 직책 + (하는일 열이 있으면 ' · ' 뒤에). 주제태그(직무 도메인)가 비었고 재직이 아니면 관심도메인을 주제태그로 쓴다(학생은 직무 도메인을 안 고르므로, 10/18 민찬).
  찾는사람이 비었으면 '관심 분야: <관심도메인>' 한 줄로 채운다. 관계태그 = 폼의 '기대하는 점' 체크
  DB 에 0015 · 0016 을 먼저 적용해야 한다(없으면 career 칸이 없거나 lab_intern 이 check 에 걸리는 오류)

10/18 사전 등록 구글폼(성하 · 민찬)을 시트로 내려받은 CSV 는 그대로 넣으면 된다. 열 이름이 질문 문장이라 앞부분으로 찾는다(FORM_HEADERS)
  이름 · 휴대폰 번호 뒤 4자리 · 구분 · 기수 · 직무 도메인(→ 주제태그, 학부생은 희망 진로) · 소속 · 학년 / 직책 · 직무명(→ 직책)
  · 해당하는 경험(→ 구분 여러 개) · 개더링에 기대하는 점(→ 관계태그)
  구분: '재학생(석/박사 연구원 포함)' · '졸업생' · '교수' · '타 학회원' · '기타(외부연사 등)' 처럼 앞부분으로 읽는다(타 학회원 · 기타 = other)
  재학생 · 졸업생 · 타 학회원 섹션이 같은 질문을 되풀이해 시트에 같은 이름 열이 여러 개 생긴다(소속 (학교·학과) · 소속처럼 앞부분만 같은 것도).
  한 사람은 한 섹션만 답하므로 열을 합쳐 처음 채워진 값을 쓴다(read_rows · resolve_cols)
  구분 여러 개 careers(0017) = 경험(기업 재직 → employed · 기업 인턴 → intern · 창업 → founder · 학부연구생 → lab_intern · 대학원 → grad)
  + 학년 · 직책 칸 말(석사 · 박사 · 석박 · 대학원 · M.S. · Ph.D → grad, 학부연구생 · 연구실 인턴 · 랩 인턴 → lab_intern, 경험에 안 골랐어도)
  + 재학생이면 student(grad 가 있으면 빼고), 타 학회원은 직책 칸에 학부 · 학년 · 재학이 있으면 student
  · 교수면 professor 만 · 기타(외부연사 등)면 employed + founder(10/19: 외부연사 두 분이 CEO, 다른 사람이 섞이면 그 사람도 재직자로 들어간다)
  경험 열이 없는 예전 CSV 는 아래 career 하나만 정한다
  구분 하나 career(0015) = careers 중 professor > employed > grad > lab_intern > student 의 첫 값(intern 만 있으면 null).
  경험 열이 없으면: 졸업생 = employed(학년 칸에 석사 · 박사면 grad), 재학생 = 학년 칸으로 grad · lab_intern · student, 교수 = professor, 그 밖 = 모름(null)
  하는일 = 학년(직책) · 소속. DSL 활동 · 연락처 · 동의 · 사주 · 롤링페이퍼 열은 읽지 않는다
  DB 에 0017 을 먼저 적용해야 한다(없으면 careers 칸이 없다는 오류). 경험 열이 없는 명단은 careers 를 건드리지 않는다(0017 전 DB 에도 적재되게).
  그래서 폼 명단을 넣은 뒤 같은 event 에 경험 열 없는 명단을 다시 넣으면 예전 careers 가 남는다(계산 서비스는 careers 를 먼저 본다)

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
# 10/18 사전 등록 구글폼 질문 → 열(질문 문장의 앞부분). 기본 열 이름이 CSV 에 없고 --map 으로 정하지 않았을 때만 쓴다
FORM_HEADERS = {"name": ("이름",), "phone": ("휴대폰 번호 뒤 4자리", "휴대폰"), "role": ("구분",), "cohort": ("기수",),
                "topic": ("직무 도메인",), "affiliation": ("소속",), "title": ("학년", "직책"),
                "intent": ("게더링에 기대하는 점", "개더링에 기대하는 점"), "exp": ("해당하는 경험",)}
# 폼 '해당하는 경험을 모두 골라 주세요' 선택지(앞부분) → 구분(careers, 0017). '해당 없음'은 아무것도 아니다
EXP_MAP = (("기업 재직", "employed"), ("기업 인턴", "intern"), ("창업", "founder"), ("학부연구생", "lab_intern"), ("대학원", "grad"))
CAREER_ORDER = ("professor", "employed", "grad", "lab_intern", "student")   # career(0015, 하나)로 고를 때의 순서. intern 은 0015 에 없다
OPERATORS = ("박성하", "황수민", "김민찬", "김나혜", "김현희")
DEFAULT_COLS = {"name": "이름", "affiliation": "소속", "role": "구분", "cohort": "기수", "phone": "휴대폰", "offer": "하는일", "seek": "찾는사람", "topic": "주제태그", "intent": "관계태그", "host": "호스트", "fixed": "고정테이블", "teams": "활동팀",
                "job": "재직", "title": "직책", "interest": "관심도메인", "exp": "경험"}


def load_env() -> None:
    p = Path(__file__).resolve().parents[1] / "apps" / "web" / ".env.local"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip()


def split_tags(v: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;,]", v or "") if t.strip()]


def role_of(raw: str) -> str:
    """구분 답 → role. 폼 선택지는 설명이 붙어 있어('재학생(석/박사 연구원 포함)') 앞부분으로도 맞춘다"""
    raw = (raw or "").strip()
    if raw in ROLE_MAP:
        return ROLE_MAP[raw]
    return next((v for k, v in ROLE_MAP.items() if raw.startswith(k)), "other")


def read_rows(path: str) -> tuple[list[str], list[dict]]:
    """CSV → (열 이름, 행). 같은 이름 열이 여러 개면(폼 섹션마다 같은 질문) 처음 채워진 값을 쓴다. csv.DictReader 는 마지막 열이 덮어써
    재학생 섹션 답이 뒤 섹션의 빈 칸에 지워진다"""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rd = csv.reader(f)
        header = [(h or "").strip() for h in next(rd, [])]
        rows = []
        for vals in rd:
            if not any((v or "").strip() for v in vals):
                continue
            r = {}
            for h, v in zip(header, vals):
                if not (r.get(h) or "").strip():
                    r[h] = v
            for h in header:                               # 끝 칸이 빠진 행도 열은 있게(DictReader 처럼). 열 확인은 rows[0] 로 한다
                r.setdefault(h, "")
            rows.append(r)
    return list(dict.fromkeys(header)), rows


def resolve_cols(cols: dict, header: list[str], explicit: set[str], rows: list[dict]) -> dict:
    """기본 열 이름이 없으면 사전 등록 폼 질문 문장의 앞부분(FORM_HEADERS)으로 열을 찾는다.
    접두어 중 하나로 시작하는 열이 하나면 그 열, 여러 개면(섹션마다 '소속 (학교·학과)' · '소속', '학년' · '직책 · 직무명') 합친 열을 만들어
    행마다 처음 채워진 값을 넣는다. 한 사람은 한 섹션만 답한다. 못 찾으면 알린다(--map 으로 정함)"""
    for k, prefixes in FORM_HEADERS.items():
        if k in explicit:
            continue
        hit = [h for h in header if any(h.startswith(p) for p in prefixes)]
        if cols[k] in header and len(hit) <= 1:           # 기본 열 이름이 있고 비슷한 열이 더 없으면 그대로('소속'만 있는 예전 명단)
            continue
        if len(hit) == 1:
            cols[k] = hit[0]
        elif hit:
            merged = " | ".join(hit)
            for r in rows:
                r[merged] = next((r[h] for h in hit if (r.get(h) or "").strip()), "")
            cols[k] = merged
            print(f"{k}: 열 {len(hit)}개를 합쳤다 {hit}")
        elif k in ("phone", "topic", "intent", "title"):          # 경험(exp)은 10/18 폼에만 있어 없어도 알리지 않는다
            print(f"{k} 열을 찾지 못했다(기본 '{cols[k]}' · 폼 '{prefixes[0]}…' 모두 없음)", file=sys.stderr)
    return cols


def career_of(role: str, job_raw: str, title: str, has_job_col: bool = True) -> str | None:
    """구분(경력, 0015 · 0016). 재직 여부 · 직책(학년) · 기존 구분으로 정한다.
    재직 열이 있으면(10/17 안) 수료(졸업생)여도 재직이 아니고 대학원생도 아니면 학생.
    재직 열이 없으면(10/18 사전 등록 폼) 졸업생은 재직자로 본다(이 폼의 구분은 지금 상태라 수료했어도 재학이면 재학생을 고름). 기타는 모름"""
    if role == "professor":
        return "professor"
    if re.search(r"학부연구생|연구실\s?인턴|랩\s?인턴", f"{job_raw} {title}"):   # '인턴' 보다 먼저: 연구실 인턴은 재직자가 아니다(회사 'AI Lab' 직책은 해당 없음)
        return "lab_intern"
    if not has_job_col:
        if re.search(r"석사|박사|석박|대학원|M\.S\.|Ph\.?D", title or "", re.I):   # 'MS Office' 같은 말은 안 걸리게 M.S. 는 점까지
            return "grad"
        return {"alumni": "employed", "student": "student", "staff": "student"}.get(role)
    if re.search(r"정규|인턴|재직|^예$", job_raw or "") and not re.search(r"아니|아님|없|미재직|안 ?함|않", job_raw or ""):
        return "employed"
    if re.search(r"석사|박사|대학원", title or ""):
        return "grad"
    return "student"


def careers_of(role: str, exp_raw: str, title: str, role_raw: str = "") -> list[str]:
    """구분 여러 개(careers, 0017). 폼 경험 문항(복수) + 구분. 교수는 professor 만.
    구분 답이 '기타(외부연사 등)'면 employed + founder(외부연사 두 분이 CEO, 10/19 민찬. 폼에서 경험 문항을 안 거친다)
    재학생은 student 를 더하되, 대학원을 골랐거나 학년이 석사 · 박사면 대학원생이라 student 대신 grad(10/18 규칙표: 스터디 팀원은 학부생).
    타 학회원(other)은 구분만으로 학생인지 모르므로 직책 칸에 학부 · 학년 · 재학이 있으면 student(10/19 민찬)"""
    if role == "professor":
        return ["professor"]
    if (role_raw or "").strip().startswith("기타"):
        return ["employed", "founder"]
    got = {v for t in split_tags(exp_raw) for k, v in EXP_MAP if t.startswith(k)}
    if re.search(r"학부연구생|연구실\s?인턴|랩\s?인턴", title or ""):      # 경험에 안 골라도 학년 · 직책에 적었으면(career_of 와 같은 말)
        got.add("lab_intern")
    if re.search(r"석사|박사|석박|대학원|M\.S\.|Ph\.?D", title or "", re.I):
        got.add("grad")
    studying = role in ("student", "staff") or (role == "other" and re.search(r"학부|학년|재학", title or ""))   # 타 학회원은 직책 칸에 학부 · 학년을 적었으면 학생
    if studying and "grad" not in got:
        got.add("student")
    return [c for c in ("employed", "intern", "founder", "grad", "lab_intern", "student") if c in got]


def name_list(v: str | None) -> list[str]:
    """--fixed-names · --exclude 값. 있는 파일 경로면 그 파일(줄마다 또는 쉼표), 아니면 쉼표 목록. 순서 유지 · 중복 제거"""
    if not v:
        return []
    raw = Path(v).read_text(encoding="utf-8-sig") if Path(v).is_file() else v
    return list(dict.fromkeys(n.strip() for n in re.split(r"[,\n]", raw) if n.strip()))


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
    ap.add_argument("--fixed-names", help="1번 테이블(교수 · 운영진석)에 고정할 이름. 쉼표 목록 또는 텍스트 파일 경로. 주면 목록 밖 사람의 고정은 비운다")
    ap.add_argument("--exclude", help="명단에서 뺄 이름(오지 않는 사람). 쉼표 목록 또는 텍스트 파일 경로")
    args = ap.parse_args()

    cols = dict(DEFAULT_COLS)
    explicit = set()
    for m in args.map:
        k, v = m.split("=", 1)
        cols[k] = v
        explicit.add(k)

    load_env()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run and (not url or not key):
        print("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요하다", file=sys.stderr)
        return 2

    import bcrypt  # pip install bcrypt

    header, rows = read_rows(args.csv)
    if not rows:
        print("CSV 가 비어 있다", file=sys.stderr)
        return 2
    cols = resolve_cols(cols, header, explicit, rows)
    missing = [c for c in (cols["name"], cols["role"]) if c not in rows[0]]
    if missing:
        print(f"CSV 에 열이 없다: {missing}. --map 으로 이름을 맞춘다", file=sys.stderr)
        return 2

    form_1018 = cols["exp"] in rows[0]                     # 경험 문항이 있는 10/18 사전 등록 폼
    fixed_names, exclude = name_list(args.fixed_names), name_list(args.exclude)
    both = [n for n in fixed_names if n in exclude]
    if both:
        print(f"--fixed-names 와 --exclude 에 모두 있는 이름: {both}. 한쪽에서 뺀다", file=sys.stderr)
        return 2
    csv_names = {(r.get(cols["name"]) or "").strip() for r in rows}
    for n in exclude:
        if n not in csv_names:
            print(f"--exclude: CSV 에 없는 이름 '{n}'", file=sys.stderr)
    skipped = []
    participants, profiles, random_pins = [], [], []
    for i, r in enumerate(rows, start=2):
        name = (r.get(cols["name"]) or "").strip()
        if not name:
            print(f"{i}행: 이름이 비어 건너뛴다", file=sys.stderr)
            continue
        if form_1018 and not (r.get(cols["role"]) or "").strip():  # 10/18 폼에서 앱 동의를 안 하면 구분이 비고 사주 섹션 이름만 남는다(필수 문항이라 그 밖에는 안 빔). 예전 명단은 그대로 other
            print(f"{i}행: 구분이 비어 건너뛴다({name})", file=sys.stderr)
            continue
        if name in exclude:
            skipped.append(name)
            continue
        role = role_of(r.get(cols["role"]))
        pin = None if args.names_only else last4(r.get(cols["phone"], ""))
        pin_from_phone = pin is not None
        host_raw = (r.get(cols["host"]) or "").strip()
        is_host = host_raw in ("예", "y", "Y", "true", "1") if host_raw else role in ("alumni", "professor")
        cohort_raw = re.sub(r"\D", "", r.get(cols["cohort"], "") or "")
        fixed_raw = (r.get(cols["fixed"]) or "").strip()
        if fixed_raw and fixed_raw != "1":                # 계산 서비스가 1번(교수 · 운영진석)만 고정한다. DB 에 쓰기 전에 거른다
            print(f"{i}행: 고정테이블 '{fixed_raw}' — 지금은 1(교수 · 운영진석)만 쓸 수 있다", file=sys.stderr)
            return 2
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
        if fixed_names:                                    # 이름 목록이 기준(위 설명). 열의 1 도 살린다
            participants[-1]["fixed_table"] = 1 if name in fixed_names or fixed_raw == "1" else None
        elif cols["fixed"] in rows[0]:
            participants[-1]["fixed_table"] = int(fixed_raw) if fixed_raw else None
        if cols["teams"] in rows[0]:
            participants[-1]["teams"] = [t.strip() for t in (r.get(cols["teams"]) or "").split(";") if t.strip()]
        offer = (r.get(cols["offer"]) or "").strip()
        seek = (r.get(cols["seek"]) or "").strip()
        topic = split_tags(r.get(cols["topic"], ""))
        form_cols = [c for c in ("job", "title", "interest") if cols[c] in rows[0]]
        if form_cols:                                      # 10/17 구글폼 열(위 설명). 없으면 예전 그대로
            title = (r.get(cols["title"]) or "").strip()
            interest = split_tags(r.get(cols["interest"], ""))
            has_job = cols["job"] in rows[0]
            career = career_of(role, (r.get(cols["job"]) or "").strip(), title, has_job)
            if cols["exp"] in rows[0]:                     # 10/18 폼 경험 문항: 구분 여러 개(0017). career 는 그중 하나
                careers = careers_of(role, r.get(cols["exp"], ""), title, r.get(cols["role"], ""))
                participants[-1]["careers"] = careers
                career = next((c for c in CAREER_ORDER if c in careers), None)
            participants[-1]["career"] = career
            if not offer and not has_job:                  # 10/18 사전 등록 폼: 하는 일 문장이 없어 학년 · 소속으로
                offer = (r.get(cols["affiliation"]) or "").strip()
            offer = " · ".join(x for x in (title, offer) if x)
            if not topic and career != "employed":
                topic = interest                           # 학생은 직무 도메인 대신 관심 도메인이 분야
            if not seek and interest:
                seek = "관심 분야: " + ", ".join(interest)
        profiles.append(
            {
                "offer_text": offer[:120],
                "seek_text": seek[:120],
                "topic_tags": topic,
                "intent_tags": split_tags(r.get(cols["intent"], "")),
            }
        )

    if exclude:
        print(f"--exclude: 뺀 사람 {len(skipped)}명 {skipped}")
    if fixed_names:
        loaded = {p["display_name"] for p in participants}
        for n in fixed_names:
            hits = sum(1 for p in participants if p["display_name"] == n)
            if n not in loaded:
                print(f"--fixed-names: CSV 에 없는 이름 '{n}'(표시 이름과 글자까지 같아야 한다)", file=sys.stderr)
            elif hits > 1:
                print(f"--fixed-names: '{n}' 이 CSV 에 {hits}명이다(동명이인 모두 1번에 고정된다)", file=sys.stderr)
        n_fixed = sum(1 for p in participants if p.get("fixed_table") == 1)
        print(f"1번 테이블 고정 {n_fixed}명")
        if n_fixed != 10:
            print(f"경고: 1번 테이블 고정이 {n_fixed}명이다. 10명(운영진 7 + 연사 교수 3)이어야 한다(계산 서비스 FIXED_TABLE_MAX 10, 넘으면 fixed_over)", file=sys.stderr)

    roles = {}
    for p in participants:
        roles[p["role"]] = roles.get(p["role"], 0) + 1
    if not any(cols[c] in rows[0] for c in ("job", "title", "interest")):
        near = [h for h in rows[0] if re.search(r"재직|직책|직무|관심", h or "")]
        print(f"구글폼 열(재직 · 직책 · 관심도메인)이 없어 구분(경력)을 정하지 않았다(추천 규칙 점수 0)."
              + (f" 비슷한 열: {near} → --map job=… title=… interest=… 로 맞춘다" if near else ""), file=sys.stderr)
    careers = {}
    for p in participants:
        if "career" in p:
            careers[p["career"]] = careers.get(p["career"], 0) + 1
    if careers:
        print(f"구분(경력, 0015) {careers}")
    multi = {}
    for p in participants:
        for c in p.get("careers") or []:
            multi[c] = multi.get(c, 0) + 1
    if any("careers" in p for p in participants):
        print(f"구분 여러 개(0017, 사람 수) {multi} · 하나도 없음 {sum(1 for p in participants if p.get('careers') == [])}명")
    print(f"읽음 {len(participants)}명 · 구분 {roles} · 호스트 {sum(p['is_host'] for p in participants)}명 · 운영자 {sum(p['is_admin'] for p in participants)}명 · 고정 테이블 {sum(1 for p in participants if p.get('fixed_table'))}명")
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
        left = sorted({r["display_name"] for r in rows_db} & set(exclude))
        if left:
            print(f"--exclude 한 사람이 이미 DB 에 있다: {left}. 이 스크립트는 지우지 않으니 계산 서비스가 그 사람도 앉힌다. 빼려면 DB 에서 직접 정리한다", file=sys.stderr)

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
