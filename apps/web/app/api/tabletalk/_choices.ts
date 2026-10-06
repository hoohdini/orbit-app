// 테이블토크 · 커피챗이 끝날 때 묻는 선택지. 키는 DB satisfaction.choice 에 그대로 저장된다(0005 마이그레이션의 check 와 같아야 한다).
// 화면은 이 목록을 순서대로 보여 준다. 문구를 바꿀 때는 label 만 고친다.
// 질문: 이번 테이블에서 새로 얻은 게 있었나요?  (10/6 3지선다로 바꿈, 0012). 키는 예전 것을 그대로 쓰고 문구만 바꿨다.
// '잘 모르겠다'(unsure)는 더 받지 않는다. 부정으로 읽혀 안 맞았다와 겹친다는 팀 피드백(10/5)
export const SATISFACTION_CHOICES = [
  { key: "gained", label: "많이 얻었어요" },
  { key: "different", label: "조금 얻었어요" },
  { key: "mismatch", label: "잘 맞지 않았어요" },
] as const;

export type SatisfactionChoice = (typeof SATISFACTION_CHOICES)[number]["key"];
export const SATISFACTION_KEYS = SATISFACTION_CHOICES.map((c) => c.key) as [SatisfactionChoice, ...SatisfactionChoice[]];

// 같은 화면 아래 선택 질문: '이런 분을 더 만나 보고 싶다' 싶었던 분이 있나요? (picks). 여러 명 가능, 안 골라도 됨.
// 안내 문구: 고른 분과 비슷한 분을 커피챗 · 추천에 더 넣어 드려요. 고른 분에게는 알리지 않아요. 안 골라도 돼요
export const PICKS_MAX = 20;
