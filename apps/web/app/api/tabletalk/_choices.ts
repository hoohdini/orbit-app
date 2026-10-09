// 테이블토크 · 커피챗이 끝날 때 묻는 선택지. 키는 DB satisfaction.choice 에 그대로 저장된다(0005 마이그레이션의 check 와 같아야 한다).
// 화면은 이 목록을 순서대로 보여 준다. 문구를 바꿀 때는 label 만 고친다.
// 질문: 이번 테이블 배정은 어땠나요? / 이번 커피챗 그룹 배정은 어땠나요?  따봉 3단계(10/9 민찬, 넷플릭스 엄지 평가 참고).
// '새로 얻은 게 있었나'로 물으면 대화가 잘 맞았어도 얻은 정보가 없으면 낮게 답하게 돼서 배정 자체를 묻는다.
// 키는 예전 것을 그대로 쓰고 문구만 바꿨다(계산 서비스 무게 1 · 0.33 · −0.2 그대로). '잘 모르겠다'(unsure)는 더 받지 않는다(10/5 팀 피드백)
export const SATISFACTION_QUESTION = { tabletalk: "이번 테이블 배정은 어땠나요?", coffeechat: "이번 커피챗 그룹 배정은 어땠나요?" } as const;
export const SATISFACTION_CHOICES = [
  { key: "gained", icon: "👍👍", label: "최고였어요" },
  { key: "different", icon: "👍", label: "좋았어요" },
  { key: "mismatch", icon: "👎", label: "별로였어요" },
] as const;

export type SatisfactionChoice = (typeof SATISFACTION_CHOICES)[number]["key"];
export const SATISFACTION_KEYS = SATISFACTION_CHOICES.map((c) => c.key) as [SatisfactionChoice, ...SatisfactionChoice[]];

// 같은 화면 아래 선택 질문: '이런 분을 더 만나 보고 싶다' 싶었던 분이 있나요? (picks). 여러 명 가능, 안 골라도 됨.
// 안내 문구: 고른 분과 비슷한 분을 커피챗 · 추천에 더 넣어 드려요. 고른 분에게는 알리지 않아요. 안 골라도 돼요
// 고를 수 있는 사람은 GET 의 candidates(나 · 동의 거부자 뺀 같은 테이블 사람). PICKS_MAX 는 비정상 요청을 막는 서버 보호용(테이블은 8~10명)
export const PICKS_MAX = 20;
export const PICK_QUESTION = "'이런 분을 더 만나 보고 싶다' 싶었던 분이 있나요?";
export const PICK_NOTE = "고른 분과 비슷한 분을 커피챗 · 추천에 더 넣어 드려요. 고른 분에게는 알리지 않아요. 안 골라도 돼요";
