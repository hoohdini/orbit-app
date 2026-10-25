// 행사 단계(개발 지시서 v0.2 '행사 흐름과 단계', A-02). 운영자가 콘솔에서 바꾸고 참가자 화면은 상태 API(B-09)로 따라온다.
// 서버 · 화면 어디서나 쓴다(server-only 아님). 값은 ops_state 의 phase 키에 문자열로 저장한다.

export const PHASES = [
  { key: "before", label: "행사 전" },
  { key: "checkin", label: "등록 · 개회" },
  { key: "tabletalk", label: "테이블토크" },
  { key: "tabletalk_end", label: "테이블토크 마무리" },
  { key: "poster", label: "포스터 세션" },
  // 커피챗 중에는 이동하지 않는다(10/21 민찬 결정, 이동 불가). 예전 coffeechat_free(자유 이동) 단계는 뺐다
  { key: "coffeechat_seated", label: "커피챗" },
  { key: "wrapup", label: "마무리" },
  { key: "award", label: "시상 · 추첨" },
] as const;

export type Phase = (typeof PHASES)[number]["key"];
export const PHASE_KEYS = PHASES.map((p) => p.key) as [Phase, ...Phase[]];

export function isPhase(v: unknown): v is Phase {
  return typeof v === "string" && (PHASE_KEYS as readonly string[]).includes(v);
}

export function phaseLabel(p: Phase | null): string {
  return PHASES.find((x) => x.key === p)?.label ?? "";
}

// 오늘 만나면 좋을 분(H-04)을 접는 단계. 세션 중에는 앞사람과 대화하라는 뜻이다
export const RECS_FOLDED: readonly Phase[] = ["tabletalk", "tabletalk_end", "coffeechat_seated"];
export function recsOpen(p: Phase | null): boolean {
  return !p || !RECS_FOLDED.includes(p);
}

// 미션 운영 구간(E-01). 서비스 소개(tabletalk)부터 마무리(wrapup) 전까지. 그 전은 곧 시작, 그 뒤는 읽기 전용
export const MISSION_OPEN: readonly Phase[] = ["tabletalk", "tabletalk_end", "poster", "coffeechat_seated"];
export const MISSION_CLOSED: readonly Phase[] = ["wrapup", "award"];
export type MissionWindow = "not_started" | "open" | "closed";
export function missionWindow(p: Phase | null): MissionWindow {
  if (p && MISSION_CLOSED.includes(p)) return "closed";
  if (p && MISSION_OPEN.includes(p)) return "open";
  return "not_started";
}

// 행사 후기(미션 ④)를 받는 단계. 커피챗이 끝난 뒤(wrapup)부터 시상(award)까지(10/22 민찬 결정).
// 미션 마감(wrapup)과 같은 때 열리므로 후기만 마감 뒤에도 쓸 수 있다
export const FEEDBACK_OPEN: readonly Phase[] = ["wrapup", "award"];
export function feedbackOpen(p: Phase | string | null): boolean {
  return !!p && (FEEDBACK_OPEN as readonly string[]).includes(p);
}

// 참가자가 일찍 나가요(checkins.left_at, 0019)를 누를 수 있는 단계. 등록 · 개회부터 커피챗까지(10/25 민찬 결정).
// 마무리(wrapup) 뒤에는 커피챗이 끝나 의미가 없어 버튼을 숨기고 API 도 받지 않는다. 행사 전(before)은 행사장에 오기 전이라 뺀다(구현하며 정함)
export const LEAVE_OPEN: readonly Phase[] = ["checkin", "tabletalk", "tabletalk_end", "poster", "coffeechat_seated"];
export function leaveOpen(p: Phase | string | null): boolean {
  return !!p && (LEAVE_OPEN as readonly string[]).includes(p);
}

// 공지 버튼 3종(A-06). 자유 입력도 받는다
export const NOTICE_PRESETS = [
  { key: "start", text: "곧 다음 순서가 시작됩니다. 자리로 모여 주세요" },
  { key: "move", text: "자리를 옮길 시간입니다. 네트워킹 탭에서 새 자리를 확인해 주세요" },
  { key: "last5", text: "마감 5분 전입니다" },
] as const;
export type NoticePreset = (typeof NOTICE_PRESETS)[number]["key"];
export const NOTICE_PRESET_KEYS = NOTICE_PRESETS.map((n) => n.key) as [NoticePreset, ...NoticePreset[]];
