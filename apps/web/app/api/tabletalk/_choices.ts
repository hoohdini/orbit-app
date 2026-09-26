// 테이블토크가 끝날 때 묻는 선택지. 키는 DB satisfaction.choice 에 그대로 저장된다(0004 마이그레이션의 check 와 같아야 한다).
// 화면은 이 목록을 순서대로 보여 준다. 문구를 바꿀 때는 label 만 고친다.
export const SATISFACTION_CHOICES = [
  { key: "gained", label: "새로 얻은 게 있었다" },
  { key: "different", label: "좋았지만 내 관심사와는 조금 달랐다" },
  { key: "unsure", label: "잘 모르겠다" },
  { key: "mismatch", label: "나와는 잘 안 맞았다" },
] as const;

export type SatisfactionChoice = (typeof SATISFACTION_CHOICES)[number]["key"];
export const SATISFACTION_KEYS = SATISFACTION_CHOICES.map((c) => c.key) as [SatisfactionChoice, ...SatisfactionChoice[]];
