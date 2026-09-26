// 포스터 모듈 순수 판정 로직. DB·세션에 의존하지 않는다. poster 모듈 API route 들이 공용으로 쓴다.

// docs/QR_FORMAT.md 의 포스터 QR(`https://<앱주소>/poster?c=<code>`) 또는 수동 입력 코드 문자열을 받아 코드만 뽑는다.
// URL 로 파싱되지만 /poster 경로가 아니거나 c 파라미터가 없으면 무효(null).
export function parsePosterCode(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!u.pathname.endsWith("/poster")) return null;
    const c = u.searchParams.get("c");
    return c && c.trim() ? c.trim() : null;
  } catch {
    // URL 형식이 아니면 코드 문자열 그대로 받는다(수동 입력 대비)
    return s;
  }
}

// 환경변수 POSTER_MAX_ATTEMPTS. 기본 3
export function parseMaxAttempts(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// 환경변수 POSTER_RAFFLE_THRESHOLDS. 쉼표로 구분된 스탬프 개수 목록. 기본 "5"
export function parseThresholds(raw: string | undefined): number[] {
  const s = (raw ?? "").trim() || "5";
  return s
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

// 스탬프 총 개수가 도달한 임계값들
export function reachedThresholds(total: number, thresholds: number[]): number[] {
  return thresholds.filter((t) => total >= t);
}

export function raffleReason(threshold: number): string {
  return `stamps_${threshold}`;
}

// 퀴즈 뒤 관심도 선택지. 키는 DB poster_interest.choice 에 그대로 저장된다(0004 마이그레이션의 check 와 같아야 한다).
export const INTEREST_CHOICES = [
  { key: "learn_more", label: "더 알아보고 싶다" },
  { key: "interesting", label: "흥미로웠다" },
  { key: "not_mine", label: "내 관심 분야는 아니다" },
] as const;

export type InterestChoice = (typeof INTEREST_CHOICES)[number]["key"];
export const INTEREST_KEYS = INTEREST_CHOICES.map((c) => c.key) as [InterestChoice, ...InterestChoice[]];
