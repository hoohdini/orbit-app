"""좌석 배정 비교 평가용 가상 80명 데이터셋 (2026-10-17).

추천 배정이 무작위 · 운영진 수기 배정보다 나은지 수치로 보이려면 '실제로 누가 누구와 맞는지'의 정답이 있어야 한다.
그래서 사람마다 숨은 속성(관심 분야, 단계, 원하는 것, 줄 수 있는 것, 활동팀)을 먼저 정하고 설문 문장은 그 속성에서 잡음을 섞어 만든다.
알고리즘은 CSV 의 문장만 보고, 평가는 truth JSON 의 숨은 속성으로 채점한다(같은 문장으로 채점하면 순환이 된다).

구성(성하 지시): 활동기수 30명(15기 15명 · 16기 15명, 운영진 7명은 15기), 지도교수 1명, 연사 2명, 수료기수 47명 = 80명.
학과 비율 · 수료기수의 기수 분포 · 진로 유형은 DSL 연명부 집계에서 가져왔다. 실명 · 연락처는 쓰지 않는다.
--avoid 로 이름 목록(한 줄에 하나)을 주면 그 이름과 겹치지 않게 뽑는다. 연명부 원본은 저장소에 두지 않는다.

좌석 규칙(10/17): 10테이블 × 8명. 운영진 · 교수 · 연사 10명은 고정테이블 1(정원을 넘어도 10명 모두, 테이블토크 배정 대상 아님).
나머지 70명은 테이블 2~10 에 8명 7개 · 7명 2개로 앉는다. truth 의 layout 이 이 구성이다.
커피챗에는 교수 · 연사가 참여하고 운영진은 참여하지 않는다. truth 의 tabletalk · coffeechat 칸이 이 구분이다.

실행  python sim/make_seat_eval_dataset.py --out sim/seat_eval_80 [--avoid 이름목록.txt] [--seed 2026]
결과  sim/seat_eval_80.csv(scripts/import_participants.py 형식) · sim/seat_eval_80_truth.json
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
from pathlib import Path

ACTIVE_COHORTS = (15, 16)  # 각 15명. 운영진은 윗기수(15기)
LAYOUT = {"tables": 10, "seats": 8, "fixed": {"1": ["staff", "professor", "speaker"]}, "tabletalk_sizes": [8] * 7 + [7] * 2}

# 분야: 이름, 세부 주제(문장에 섞어 문장끼리 덜 닮게 한다)
DOMAINS = {
    "추천시스템": ["커머스 상품 추천", "세션 기반 추천 모델", "협업 필터링", "추천 노출 다양성", "콘텐츠 추천 피드"],
    "LLM·자연어처리": ["RAG 챗봇", "LLM 파인튜닝", "한국어 감성 분석", "문서 요약", "프롬프트 평가 자동화"],
    "컴퓨터비전": ["객체 탐지", "의료 영상 분할", "이미지 생성 모델", "OCR", "제조 불량 검출"],
    "금융·퀀트": ["퀀트 전략 백테스트", "주가 변동성 예측", "포트폴리오 최적화", "카드 거래 이상 탐지", "신용평가 모형"],
    "보험·리스크": ["보험 손해율 예측", "계리 모형", "리스크 관리 지표", "장기계약 해지 예측"],
    "마케팅·광고": ["광고 효과 분석", "고객 세분화", "이탈 예측", "마케팅 믹스 모형", "CRM 캠페인 분석"],
    "데이터엔지니어링·MLOps": ["데이터 파이프라인", "모델 서빙", "피처 스토어", "대용량 로그 처리", "분산 학습 시스템"],
    "인과추론·실험": ["A/B 테스트 설계", "인과효과 추정", "정책 효과 평가", "업리프트 모델링"],
    "바이오·헬스케어": ["유전체 데이터 분석", "임상 데이터 통계", "의료 AI", "생존 분석"],
    "사회과학·정책": ["여론 데이터 분석", "공공데이터 활용", "사회 연결망 분석", "텍스트로 보는 미디어 담론"],
    "컨설팅·전략": ["DT 컨설팅", "AI 도입 전략", "경영 지표 대시보드", "산업 리서치"],
    "시계열·수요예측": ["수요 예측", "에너지 사용량 예측", "공급망 최적화", "센서 데이터 이상 탐지"],
    "게임·엔터": ["게임 유저 행동 분석", "게임 내 매칭 알고리즘", "음원 스트리밍 데이터"],
    "통계방법론": ["베이지안 모델링", "고차원 통계", "통계적 학습 이론", "결측 데이터 처리"],
}

# 문장에 쓰는 말(태그 이름을 그대로 쓰면 어색하다)
WORD = {"추천시스템": "추천 시스템", "LLM·자연어처리": "자연어처리", "컴퓨터비전": "컴퓨터 비전", "금융·퀀트": "금융 데이터",
        "보험·리스크": "보험 리스크", "마케팅·광고": "마케팅 분석", "데이터엔지니어링·MLOps": "데이터 엔지니어링", "인과추론·실험": "인과추론",
        "바이오·헬스케어": "헬스케어 데이터", "사회과학·정책": "사회과학 데이터", "컨설팅·전략": "데이터 컨설팅", "시계열·수요예측": "시계열 예측",
        "게임·엔터": "게임 데이터", "통계방법론": "통계 방법론"}

# 연명부 학과 집계(상위)와 학과별로 잘 고르는 분야
MAJORS = [
    ("응용통계학과", 40, ["통계방법론", "금융·퀀트", "추천시스템", "인과추론·실험", "LLM·자연어처리", "마케팅·광고", "바이오·헬스케어",
                     "추천시스템", "LLM·자연어처리", "데이터엔지니어링·MLOps", "컴퓨터비전"]),
    ("경제학과", 11, ["금융·퀀트", "인과추론·실험", "사회과학·정책", "컨설팅·전략"]),
    ("경영학과", 8, ["마케팅·광고", "컨설팅·전략", "금융·퀀트", "추천시스템"]),
    ("산업공학과", 6, ["시계열·수요예측", "데이터엔지니어링·MLOps", "추천시스템", "컨설팅·전략"]),
    ("컴퓨터과학과", 5, ["LLM·자연어처리", "컴퓨터비전", "데이터엔지니어링·MLOps", "게임·엔터"]),
    ("사회학과", 3, ["사회과학·정책", "인과추론·실험", "LLM·자연어처리"]),
    ("언론홍보영상학부", 3, ["마케팅·광고", "사회과학·정책", "게임·엔터"]),
    ("계량위험관리학과", 3, ["보험·리스크", "금융·퀀트"]),
    ("수학과", 2, ["통계방법론", "금융·퀀트"]),
    ("생명공학과", 2, ["바이오·헬스케어", "컴퓨터비전"]),
    ("심리학과", 2, ["인과추론·실험", "사회과학·정책", "마케팅·광고"]),
    ("문헌정보학과", 2, ["LLM·자연어처리", "추천시스템"]),
]

# 수료기수 기수 분포: 연명부 인원(1~14기)에 최근 기수일수록 더 온다는 가중을 곱했다
ROSTER_COHORT = {1: 28, 2: 24, 3: 24, 4: 23, 5: 14, 6: 15, 7: 16, 8: 18, 9: 22, 10: 9, 11: 17, 12: 12, 13: 17, 14: 15}

# 원하는 것(관계 태그와 같은 말)과 그걸 줄 수 있는 사람
GOALS = ["취업정보", "대학원진학", "멘토링", "프로젝트팀원", "스터디", "연구협업", "채용", "창업", "이직정보"]
GIVES_BY_STAGE = {
    "학부저학년": ["프로젝트팀원", "스터디"],
    "학부고학년": ["프로젝트팀원", "스터디", "취업정보"],
    "대학원생": ["대학원진학", "연구협업", "스터디"],
    "주니어": ["취업정보", "멘토링", "이직정보"],
    "시니어": ["멘토링", "채용", "이직정보", "취업정보"],
    "창업자": ["채용", "창업", "멘토링"],
    "교수": ["대학원진학", "연구협업", "멘토링"],
}
GOALS_BY_STAGE = {
    "학부저학년": (["스터디", "프로젝트팀원", "멘토링", "취업정보"], [3, 3, 2, 1]),
    "학부고학년": (["취업정보", "대학원진학", "멘토링", "프로젝트팀원"], [4, 3, 2, 1]),
    "대학원생": (["취업정보", "연구협업", "멘토링", "스터디"], [3, 3, 1, 1]),
    "주니어": (["이직정보", "연구협업", "스터디", "창업"], [3, 2, 2, 1]),
    "시니어": (["채용", "연구협업", "창업"], [4, 2, 1]),
    "창업자": (["채용", "연구협업"], [3, 1]),
    "교수": (["연구협업", "채용"], [3, 1]),
}

# 자리(소속) 문구. 진로 유형은 연명부 경력사항 집계(대학원, IT 기업 데이터직, 컨설팅, 금융권, 스타트업)를 일반 명칭으로 바꿨다
WORKPLACE = {
    "추천시스템": ["커머스 플랫폼", "콘텐츠 플랫폼"], "LLM·자연어처리": ["AI 스타트업", "대형 IT 기업"],
    "컴퓨터비전": ["전자 회사", "AI 스타트업"], "금융·퀀트": ["증권사", "카드사", "은행"], "보험·리스크": ["손해보험사", "신용평가사"],
    "마케팅·광고": ["광고 대행사", "커머스 플랫폼"], "데이터엔지니어링·MLOps": ["대형 IT 기업", "클라우드 회사"],
    "인과추론·실험": ["핀테크 스타트업", "커머스 플랫폼"], "바이오·헬스케어": ["바이오 제약사", "의료 AI 스타트업"],
    "사회과학·정책": ["국책 연구소", "공공기관"], "컨설팅·전략": ["컨설팅펌"], "시계열·수요예측": ["제조 대기업", "에너지 회사"],
    "게임·엔터": ["게임 회사", "엔터테인먼트 회사"], "통계방법론": ["국책 연구소", "대형 IT 기업"],
}
GRAD = ["통계데이터사이언스 대학원", "인공지능 대학원", "산업공학 대학원", "경제학 대학원", "컴퓨터과학 대학원"]
JOB = {"시니어": ["리드", "팀장", "시니어 데이터 사이언티스트"], "주니어": ["데이터 사이언티스트", "데이터 분석가", "ML 엔지니어"]}

# 문장 틀. 한 사람의 문장 2~3개 + 잡음(모호한 답, 빈 답)
DOING = {
    "학부저학년": ["{d} 공부를 막 시작했다", "학회에서 {t} 프로젝트를 하고 있다", "{t} 관련 수업을 듣고 있다", "{t} 튜토리얼을 따라 해 보고 있다"],
    "학부고학년": ["{t} 프로젝트를 진행 중이다", "{w}에서 {t} 인턴을 했다", "졸업 프로젝트로 {t}을를 하고 있다", "{t} 공모전을 준비 중이다", "{d} 직무로 취업을 준비한다"],
    "대학원생": ["{g}에서 {t}을를 연구한다", "{t} 논문을 쓰고 있다", "석사 과정에서 {d}을를 공부한다", "연구실에서 {t} 과제를 맡고 있다"],
    "주니어": ["{w}에서 {t} 업무를 {y}년째 하고 있다", "{w} {j}으로로 {t}을를 맡고 있다", "회사에서 {t} 모델을 만들고 있다"],
    "시니어": ["{w}에서 {d} 조직을 이끌고 있다", "{w} {j}으로로 {y}년째 일하고 있다", "{t} 시스템을 설계 · 운영한다", "{d} 실무 경력이 {y}년이다"],
    "창업자": ["{t} 스타트업을 창업해 운영 중이다", "{d} 분야 스타트업 대표다", "초기 팀에서 {t} 제품을 만들고 있다"],
    "교수": ["{d} 분야를 연구한다", "연구실에서 {t} 과제를 지도한다", "{t} 관련 수업을 맡고 있다"],
}
EXTRA = ["파이썬과 SQL 을 주로 쓴다", "캐글 대회에 몇 번 나가 봤다", "비전공으로 데이터 공부를 시작했다", "대시보드 만드는 걸 좋아한다",
         "논문 구현 스터디를 하고 있다", "통계 이론에 관심이 많다", "시각화 작업을 자주 한다", "R 보다 파이썬이 편하다"]
SEEK = {
    "취업정보": ["{d} 직무 현업자의 실제 업무 이야기를 듣고 싶다", "{d} 쪽 취업 준비를 어떻게 했는지 묻고 싶다", "신입으로 {d} 분야에 들어가는 길이 궁금하다"],
    "대학원진학": ["{d} 대학원 진학 경험을 듣고 싶다", "연구실 선택 기준을 선배에게 묻고 싶다", "석사 진학과 취업 사이에서 고민 중이다"],
    "멘토링": ["{d} 선배에게 커리어 조언을 받고 싶다", "포트폴리오 피드백을 받고 싶다", "진로 고민을 나눌 선배를 찾는다"],
    "프로젝트팀원": ["{t} 프로젝트를 같이 할 사람을 찾는다", "공모전 팀원을 구한다", "사이드 프로젝트 동료를 만나고 싶다"],
    "스터디": ["{d} 같이 공부할 동료를 찾는다", "{t} 논문 스터디 멤버를 구한다", "꾸준히 같이 공부할 사람이 필요하다"],
    "연구협업": ["{t} 주제로 공동 연구할 사람을 찾는다", "{d} 쪽 현업 데이터로 협업하고 싶다", "산학 협력 파트너를 만나고 싶다"],
    "채용": ["{d} 쪽 함께 일할 후배를 찾는다", "{t} 인턴 후보를 만나고 싶다", "팀에 올 주니어 인재를 찾는다"],
    "창업": ["{d} 창업에 관심 있는 사람을 만나고 싶다", "창업 경험을 들려줄 분을 찾는다"],
    "이직정보": ["{d} 다른 회사의 일하는 방식이 궁금하다", "이직을 고민 중이라 다른 업계 이야기를 듣고 싶다"],
}
VAGUE_SEEK = ["다양한 분야 분들과 이야기 나눠 보고 싶다", "편하게 대화할 사람", "아무나 좋아요", "새로운 사람들을 만나고 싶다"]

SURNAMES = ("김" * 21 + "이" * 14 + "박" * 8 + "최" * 5 + "정" * 5 + "강조윤장임" * 2 + "한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편")
GIVEN = ["민준", "서연", "도윤", "지우", "하은", "예준", "수아", "시우", "지민", "주원", "하린", "지호", "윤서", "유준", "채원",
         "건우", "다은", "현우", "서윤", "우진", "지아", "선우", "가은", "연우", "수빈", "정우", "예린", "승현", "소율", "태윤",
         "은채", "민재", "지안", "현서", "예은", "준혁", "나은", "재윤", "서진", "하람", "도현", "유나", "승우", "다인", "지훈",
         "시은", "민성", "아린", "태민", "혜원", "동하", "보민", "규리", "성민", "유진", "재희", "한결", "세아", "준서", "은호"]


def wpick(rng, items, weights):
    return rng.choices(items, weights=weights, k=1)[0]


def make(seed=2026, avoid=frozenset()):
    rng = random.Random(seed)
    used, people = set(avoid), []

    def name():
        while True:
            n = rng.choice(SURNAMES) + rng.choice(GIVEN)
            if n not in used:
                used.add(n)
                return n

    def domains(pool):
        a = rng.choice(pool)
        b = rng.choice([d for d in (pool + list(DOMAINS)) if d != a])  # 둘째 관심은 학과 밖에서도 나온다
        return a, b

    def goals(stage):
        items, w = GOALS_BY_STAGE[stage]
        g = [wpick(rng, items, w)]
        if rng.random() < 0.5:
            rest = [(x, y) for x, y in zip(items, w) if x != g[0]]
            if rest:
                g.append(wpick(rng, [x for x, _ in rest], [y for _, y in rest]))
        return g

    def add(group, cohort, stage, major, affiliation, d, teams, workplace=None, grad=None):
        people.append(dict(pid=f"V{len(people) + 1:02d}", name=name(), group=group, cohort=cohort, stage=stage, major=major,
                           affiliation=affiliation, domains=list(d), goals=goals(stage), gives=list(GIVES_BY_STAGE[stage]),
                           teams=teams, workplace=workplace, grad=grad))

    majors = [m for m, _, _ in MAJORS]
    mw = [w for _, w, _ in MAJORS]
    pool = {m: p for m, _, p in MAJORS}

    # 활동기수 30명(15기 → 16기 순, 운영진 7명은 15기 앞쪽). 프로젝트 6팀 · 스터디 4팀에 나눠 넣는다(같은 팀 = 이미 아는 사이)
    proj = [f"26-2 {t} 프로젝트" for t in ("추천시스템", "LLM", "금융", "헬스케어", "마케팅", "시계열")]
    study = [f"26-2 {t} 스터디" for t in ("딥러닝 기초", "인과추론", "논문 리딩", "SQL")]
    order = list(range(30))
    rng.shuffle(order)
    for k in range(30):
        m = wpick(rng, majors, mw)
        cohort = ACTIVE_COHORTS[k // 15]
        stage = "학부고학년" if rng.random() < (0.65 if cohort == ACTIVE_COHORTS[0] else 0.35) else "학부저학년"
        if rng.random() < 0.08:
            stage = "대학원생"
        teams = [proj[order[k] % 6]] + ([study[order[k] % 4]] if rng.random() < 0.5 else [])
        add("staff" if k < 7 else "active", cohort, stage, m, f"연세대 {m}", domains(pool[m]), teams)

    # 지도교수 1명
    add("professor", None, "교수", "응용통계학과", "연세대 응용통계학과", ("통계방법론", "추천시스템"), [])

    # 연사 2명: 현업 리드 1, 창업자 1
    for stage, d in (("시니어", ("LLM·자연어처리", "데이터엔지니어링·MLOps")), ("창업자", ("인과추론·실험", "마케팅·광고"))):
        w = rng.choice(WORKPLACE[d[0]])
        add("speaker", None, stage, wpick(rng, majors, mw), w if stage == "시니어" else "데이터 스타트업", d, [], workplace=w)

    # 수료기수 47명
    coh = list(ROSTER_COHORT)
    cw = [ROSTER_COHORT[c] * (1 + c / 14) for c in coh]
    alumni_team = {}
    for _ in range(47):
        c = wpick(rng, coh, cw)
        m = wpick(rng, majors, mw)
        if c <= 5:
            stage = wpick(rng, ["시니어", "창업자", "교수"], [7, 2, 1])
        elif c <= 10:
            stage = wpick(rng, ["시니어", "주니어", "대학원생", "창업자"], [3, 5, 2, 0.5])
        else:
            stage = wpick(rng, ["주니어", "대학원생", "학부고학년"], [3, 3, 3])
        d = domains(pool[m])
        w = g = None
        if stage in ("시니어", "주니어"):
            w = rng.choice(WORKPLACE[d[0]])
            aff = w
        elif stage == "창업자":
            aff = "데이터 스타트업"
        elif stage == "대학원생":
            g = rng.choice(GRAD)
            aff = f"연세대 {g}"
        elif stage == "교수":
            aff = "대학 연구실"
        else:
            aff = f"연세대 {m}"
        # 같은 기수 안에서 같이 프로젝트를 한 사이: 기수마다 팀 2개 중 하나(60%)
        teams = []
        if rng.random() < 0.6:
            t = f"{c}기 {rng.choice(['A', 'B'])}팀 프로젝트"
            alumni_team[t] = alumni_team.get(t, 0) + 1
            teams.append(t)
        add("alumni", c, stage, m, aff, d, teams, workplace=w, grad=g)

    for p in people:
        p["tabletalk"] = p["group"] in ("active", "alumni")
        p["coffeechat"] = p["group"] != "staff"
        p["host"] = p["stage"] not in ("학부저학년", "학부고학년") and p["group"] != "active" and p["group"] != "staff"
        p["fixed_table"] = 1 if p["group"] in ("staff", "professor", "speaker") else None
        p.update(texts(rng, p))
    return people


def josa(s):
    """'을를' · '으로로' 표시를 앞 글자 받침에 맞춘다. 영문 · 숫자로 끝나면 받침 없음으로 본다."""
    def pick(m):
        c, mark = m.group(1), m.group(2)
        code = ord(c) - 0xAC00
        jong = code % 28 if 0 <= code < 11172 else 0
        if mark == "을를":
            return c + ("을" if jong else "를")
        return c + ("으로" if jong and jong != 8 else "로")  # ㄹ 받침은 '로'
    return re.sub(r"(.)(을를|으로로)", pick, s)


def texts(rng, p):
    """숨은 속성 → 설문 문장. 잡음: 둘째 관심만 쓰거나, 찾는 사람을 모호하게 · 비워 두거나, 태그를 덜 다는 사람이 있다."""
    d1, d2 = p["domains"]
    stage = p["stage"]
    fill = lambda s, d: josa(s.format(d=WORD[d], t=rng.choice(DOMAINS[d]), w=p["workplace"] or "회사", g=p["grad"] or "대학원",
                                      j=rng.choice(JOB.get(stage, ["데이터 사이언티스트"])), y=rng.randint(1, 4) if stage == "주니어" else rng.randint(5, 15)))
    doing = rng.sample(DOING[stage], min(2, len(DOING[stage])))
    offer = [fill(doing[0], d1)]
    if rng.random() < 0.6:
        offer.append(fill(doing[1], d2))
    if stage.startswith("학부") and rng.random() < 0.5:
        offer.append(rng.choice(EXTRA))

    r = rng.random()
    if r < 0.12:
        seek, clarity = "", "blank"
    elif r < 0.24:
        seek, clarity = rng.choice(VAGUE_SEEK), "vague"
    else:
        seek = "\n".join(fill(rng.choice(SEEK[g]), rng.choice([d1, d1, d2])) for g in p["goals"])
        clarity = "clear"

    topic = [d1] + ([d2] if rng.random() < 0.7 else [])
    intent = [g for g in p["goals"] if rng.random() < 0.7]
    return dict(offer_text="\n".join(offer), seek_text=seek, seek_clarity=clarity, topic_tags=topic, intent_tags=intent)


ROLE = {"staff": "운영진", "active": "재학생", "alumni": "졸업생", "professor": "교수", "speaker": "기타"}


def to_csv_row(p):
    return {"이름": p["name"], "소속": p["affiliation"], "구분": ROLE[p["group"]], "기수": p["cohort"] or "", "휴대폰": "",
            "하는일": p["offer_text"], "찾는사람": p["seek_text"], "주제태그": ";".join(p["topic_tags"]),
            "관계태그": ";".join(p["intent_tags"]), "호스트": "예" if p["host"] else "아니오",
            "고정테이블": p["fixed_table"] or "", "활동팀": ";".join(p["teams"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).with_name("seat_eval_80")))
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--avoid", help="겹치면 안 되는 이름 목록(한 줄에 하나)")
    a = ap.parse_args()
    avoid = frozenset(Path(a.avoid).read_text(encoding="utf-8").split()) if a.avoid else frozenset()
    P = make(a.seed, avoid)
    with open(f"{a.out}.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(to_csv_row(P[0])))
        w.writeheader()
        w.writerows(to_csv_row(p) for p in P)
    with open(f"{a.out}_truth.json", "w", encoding="utf-8") as f:
        json.dump({"seed": a.seed, "layout": LAYOUT, "people": P}, f, ensure_ascii=False, indent=1)
    by = {}
    for p in P:
        by[p["group"]] = by.get(p["group"], 0) + 1
    print(f"{len(P)}명 {by} → {a.out}.csv, {a.out}_truth.json")


if __name__ == "__main__":
    main()
