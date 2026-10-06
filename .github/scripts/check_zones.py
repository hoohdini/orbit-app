"""PR 구역 검사. 브랜치 이름의 앞부분(fe/, be/ ...)으로 이 PR 이 고쳐도 되는 폴더를 정하고, 벗어난 파일이 있으면 실패한다.

목적은 충돌 예방이다. 프론트 PR 은 화면 폴더만, 백엔드 PR 은 API · DB 폴더만 고치면 두 PR 이 같은 파일을 건드리지 않는다.
구역 표의 정본은 docs/COLLAB.md 다. 이 파일의 ZONES 를 고치면 그 문서의 표도 같이 고친다.

환경변수: BASE_REF(합칠 대상 브랜치), HEAD_REF(PR 브랜치), PR_LABELS(라벨 이름 JSON 배열)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

EXCEPTION_LABEL = "구역-예외"

FE = [
    "apps/web/app/(modules)/",
    "apps/web/components/",
    "apps/web/public/",
    "apps/web/app/globals.css",
    "apps/web/app/layout.tsx",
    "apps/web/app/page.tsx",
    "apps/web/app/logout/",
    "apps/web/app/dev/",
]
BE = [
    "apps/web/app/api/",
    "apps/web/lib/",
    "supabase/",
    "scripts/",
]
COMPUTE = ["services/compute/"]
DOCS = ["docs/", "README.md"]

# 브랜치 앞부분 → 고쳐도 되는 경로(앞부분 일치). setup 은 전부.
ZONES: dict[str, list[str] | None] = {
    "fe": FE,
    "be": BE + DOCS,
    "compute": COMPUTE + DOCS,
    "docs": DOCS,
    "setup": None,
}

# 위반 안내에 쓰는 이름. 어느 구역 파일인지, 누구에게 부탁할지 알려 준다.
OWNER_HINT = [
    (FE, "프론트 구역(fe/ 브랜치)"),
    (BE, "백엔드 구역(be/ 브랜치, 성하)"),
    (COMPUTE, "계산 서비스 구역(compute/ 브랜치, 민찬)"),
    (DOCS, "문서 구역(docs/ 브랜치)"),
]


def zone_of(path: str) -> str:
    for prefixes, name in OWNER_HINT:
        if any(path.startswith(p) for p in prefixes):
            return name
    return "공용 파일(setup/ 브랜치, 성하만): package.json · package-lock.json · 설정 파일 · .github · CLAUDE.md · AGENTS.md"


def changed_files(base: str) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--name-only", "--no-renames", f"origin/{base}...HEAD"],
        check=True, capture_output=True, text=True,
    ).stdout
    return [line for line in out.splitlines() if line.strip()]


def report(lines: list[str]) -> None:
    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")


def main() -> int:
    base = os.environ["BASE_REF"]
    head = os.environ["HEAD_REF"]
    labels = json.loads(os.environ.get("PR_LABELS") or "[]")

    if EXCEPTION_LABEL in labels:
        report([f"## 구역 검사: 통과 (`{EXCEPTION_LABEL}` 라벨)", "", "성하가 예외로 허용한 PR 이다."])
        return 0

    prefix = head.split("/", 1)[0] if "/" in head else ""
    if prefix not in ZONES:
        report([
            "## 구역 검사: 실패 (브랜치 이름)",
            "",
            f"브랜치 `{head}` 의 앞부분이 정해진 이름이 아니다. 아래 중 하나로 시작해야 한다.",
            "",
            "- `fe/...` 화면(프론트)",
            "- `be/...` API · DB(백엔드)",
            "- `compute/...` 계산 서비스",
            "- `docs/...` 문서",
            "- `setup/...` 공용 설정(성하만)",
            "",
            "고치는 법: `git branch -m fe/할일-이름` 으로 이름을 바꾸고 새로 push 한 뒤 PR 을 다시 연다. 자세한 것은 docs/COLLAB.md.",
        ])
        return 1

    allowed = ZONES[prefix]
    files = changed_files(base)
    if allowed is None:
        report([f"## 구역 검사: 통과 (`{prefix}/` 는 전체 허용)", "", f"바꾼 파일 {len(files)}개"])
        return 0

    bad = [f for f in files if not any(f.startswith(p) for p in allowed)]
    if not bad:
        report([f"## 구역 검사: 통과 (`{prefix}/`)", "", f"바꾼 파일 {len(files)}개 모두 구역 안"])
        return 0

    lines = [
        f"## 구역 검사: 실패 (`{prefix}/` 브랜치가 구역 밖 파일 {len(bad)}개를 고침)",
        "",
        "| 파일 | 이 파일의 구역 |",
        "|---|---|",
    ]
    lines += [f"| `{f}` | {zone_of(f)} |" for f in bad]
    lines += [
        "",
        "고치는 법",
        "",
        "1. 실수로 바뀐 파일이면 되돌린다: `git checkout origin/main -- 파일경로` 후 커밋 · push.",
        "   `package-lock.json` 이 바뀐 것은 대개 `npm install` 때문이다. 같은 방법으로 되돌린다.",
        "2. 정말 그 파일을 바꿔야 하면, 이 PR 에서 빼고 PR 설명의 '다른 구역에 부탁할 것' 칸에 적는다. 담당자가 따로 PR 을 낸다.",
        f"3. 어쩔 수 없는 경우는 성하가 `{EXCEPTION_LABEL}` 라벨을 붙인다.",
    ]
    report(lines)
    return 1


if __name__ == "__main__":
    sys.exit(main())
