"""가상 참가자 CSV 를 만든다 — scripts/import_participants.py 가 그대로 읽는 형식.

실명 · 연락처는 없다. 이름은 가상01 … , 휴대폰 칸은 비워서 적재 스크립트가 무작위 4자리를 --pin-out 파일에 적게 한다.
구성은 행사 예상에 맞춘다: 재학생 · 졸업생(호스트) · 교수(호스트) · 운영진 2명.
Offer 는 줄바꿈으로 나눈 짧은 항목 2~3개(항목별 평균이 긴 글 하나보다 정확했다), Seek 는 15% 가 비어 있다.

실행  python sim/make_fake_csv.py sim/fake_70.csv
적재  python scripts/import_participants.py services/compute/sim/fake_70.csv --event-id dev --pin-out <저장소 밖 경로>
"""
from __future__ import annotations

import csv
import random
import sys

FIELDS = ["추천시스템", "자연어처리", "컴퓨터비전", "시계열", "금융·핀테크", "광고·마케팅", "회계·재무",
          "HR 데이터", "바이오 통계", "데이터 엔지니어링", "강화학습", "인과추론", "최적화", "게임·엔터"]
DOING = ["{f} 연구를 하고 있다", "{f} 인턴을 하고 있다", "{f} 프로젝트를 진행 중이다", "{f} 쪽으로 대학원을 준비한다",
         "{f} 스터디를 이끌고 있다", "{f} 공모전을 준비하고 있다"]
DOING_HOST = ["회사에서 {f} 업무를 {y}년째 하고 있다", "{f} 팀에서 모델을 운영한다", "{f} 분야를 연구한다"]
EXTRA = ["파이썬과 SQL 을 주로 쓴다", "통계학을 전공했다", "캐글 대회에 나가 봤다", "대시보드를 만들어 봤다",
         "논문 구현을 자주 한다", "비전공자로 데이터 공부를 시작했다"]
SEEK = ["{f} 현업자에게 커리어 조언을 듣고 싶다", "{f} 같이 공부할 동료를 찾는다", "{f} 대학원 진학 경험을 듣고 싶다",
        "{f} 프로젝트 팀원을 구한다", "{f} 분야 선배에게 포트폴리오 피드백을 받고 싶다"]
SEEK_HOST = ["{f} 에 관심 있는 후배를 만나고 싶다", "{f} 쪽 채용 후보를 찾는다"]
INTENTS = ["멘토링", "취업정보", "대학원진학", "프로젝트팀원", "채용", "창업"]


def rows(n_student=52, n_alumni=12, n_prof=4, n_staff=2, seed=11):
    rng = random.Random(seed)
    out, k = [], 0

    def add(kind, cohort, host):
        nonlocal k
        k += 1
        f, g = rng.choice(FIELDS), rng.choice(FIELDS)
        if host:
            offer = [rng.choice(DOING_HOST).format(f=f, y=rng.randint(2, 9)), rng.choice(DOING_HOST).format(f=g, y=rng.randint(2, 9))]
            seek = rng.choice(SEEK_HOST).format(f=f) if rng.random() < 0.6 else ""
        else:
            offer = [rng.choice(DOING).format(f=f), rng.choice(EXTRA)] + ([rng.choice(DOING).format(f=g)] if rng.random() < 0.5 else [])
            seek = "" if rng.random() < 0.15 else rng.choice(SEEK).format(f=rng.choice([f, g, rng.choice(FIELDS)]))
        out.append({"이름": f"가상{k:02d}", "소속": "가상대학교" if not host else "가상회사", "구분": kind,
                    "기수": cohort or "", "휴대폰": "", "하는일": "\n".join(offer), "찾는사람": seek,
                    "주제태그": ";".join(sorted({f, g})), "관계태그": ";".join(rng.sample(INTENTS, rng.randint(0, 2))),
                    "호스트": "예" if host else "아니오"})

    for _ in range(n_student):
        add("재학생", rng.randint(11, 14), False)
    for _ in range(n_alumni):
        add("졸업생", rng.randint(1, 10), True)
    for _ in range(n_prof):
        add("교수", None, True)
    for _ in range(n_staff):
        add("운영진", 14, False)
    return out


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sim/fake_70.csv"
    R = rows()
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(R[0]))
        w.writeheader()
        w.writerows(R)
    print(f"{len(R)}명 → {path}")
