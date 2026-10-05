"""줄임말 사전(apps/web/app/api/card/_aliases.json) 채우기용 후보 목록. 사전 등록이 끝난 뒤 행사 전에 한 번 돌린다(10/5 민찬 결정).

하는 일  그 행사 참가자의 관심 태그 표기와 사람 수, '지금 하는 일' 에 자주 나온 영문 · 줄임말을 뽑고, 사전에 이미 있는지 표시한다.
         사전에 없는 것을 같은 뜻 다른 표기끼리 묶는 일은 사람(또는 Claude 초안 → 사람 확인)이 한다. 비슷한 분야(은행 ~ 금융)는 묶지 않는다
실행     python sim/alias_candidates.py orbit-2026 > 후보.tsv     (읽기만 함. DB 에 쓰지 않는다)
출력     종류(tag | word) · 표기 · 사람 수 · 사전에 있음(y/n), 사람 많은 순
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from repo import SupabaseRepo  # noqa: E402
from sim.cleanup_event import load_env  # noqa: E402

ALIASES = Path(__file__).resolve().parents[3] / "apps/web/app/api/card/_aliases.json"
WORD = re.compile(r"[A-Za-z][A-Za-z0-9.+/#-]{1,}")      # 하는 일 안의 영문 · 줄임말(LLM · A/B · Ph.D. · C++). 비교는 웹과 같은 norm 그대로


def norm(s: str) -> str:
    """웹 _keyword.ts 의 norm 과 같게: NFKC · 소문자 · 띄어쓰기 · 붙임표 · 밑줄 · 가운뎃점 지움."""
    return re.sub(r"[\s\-_·]+", "", unicodedata.normalize("NFKC", s or "").lower())


def main():
    event = sys.argv[1]
    load_env()
    r = SupabaseRepo()
    ids = [p["id"] for p in r.participants(event)]
    prof = r.profiles(ids)
    known = {norm(a) for g in json.loads(ALIASES.read_text(encoding="utf-8"))["groups"] for a in g}
    tags: dict[str, Counter] = {}
    words: dict[str, Counter] = {}
    for pid, p in prof.items():
        for t in {t.strip() for t in p.get("topic_tags") or [] if t.strip()}:
            tags.setdefault(norm(t), Counter())[t] += 1
        for w in {m.group(0) for m in WORD.finditer(p.get("offer_text") or "")}:
            words.setdefault(norm(w), Counter())[w] += 1
    print("종류\t표기\t사람 수\t사전에 있음")
    for kind, d in (("tag", tags), ("word", words)):
        for k, c in sorted(d.items(), key=lambda kv: -sum(kv[1].values())):
            print(f"{kind}\t{' / '.join(f for f, _ in c.most_common())}\t{sum(c.values())}\t{'y' if k in known else 'n'}")


if __name__ == "__main__":
    main()
