// 이벤트 탭 가짜 데이터(10/21 미션 개편). USE_MOCK 을 켰을 때만 화면이 이것을 쓴다(서버 없이 화면 확인용). 응답 모양은 missions.ts 의 Missions 와 같다.
// 화면 확인용: /event?mock=base | progress | done | closed (기본 base: 아직 아무 미션도 시도하지 않은 기본 화면)
import { stampsOf, type Mission, type Missions } from "./missions";

export const USE_MOCK = false; // 서버(be/)가 새 미션 구성과 후기 API 를 내므로 끈다. 켜면 아래 가짜 데이터로 화면만 확인할 수 있다

export type Scenario = "base" | "progress" | "done" | "closed";
const SCENARIOS: Scenario[] = ["base", "progress", "done", "closed"];

const mission = (key: Mission["key"], label: string, goal: number, count: number, milestones?: number[]): Mission => {
  const m: Mission = { key, label, goal, count, done: count >= goal, completed_at: null, ...(milestones ? { milestones } : {}) };
  return m;
};

// 값: [관심 포스터, 퀴즈, 명함 교환, 피드백]
const COUNTS: Record<Scenario, [number, number, number, number]> = {
  base: [0, 0, 0, 0],
  progress: [2, 0, 3, 0],
  done: [2, 3, 5, 1],
  closed: [2, 1, 3, 0],
};

// 스탬프는 포스터 1 · 퀴즈 1 · 명함 교환 2 · 피드백 1 = 5칸
export function build(counts: [number, number, number, number], closed = false): Missions {
  const missions = [mission("poster", "포스터 관심도", 2, counts[0]), mission("quiz", "퀴즈", 3, counts[1]), mission("exchange", "명함 교환", 5, counts[2], [3, 5]), mission("feedback", "행사 후기", 1, counts[3])];
  const stamps = missions.reduce((n, m) => n + stampsOf(m).filter(Boolean).length, 0);
  return { window: closed ? "closed" : "open", closed_at: closed ? "2026-10-24T07:45:00Z" : null, missions, done_count: stamps, total: 5, progress: stamps / 5, completed_all_at: stamps === 5 ? "2026-10-24T07:30:00Z" : null };
}

export function scenarioFromUrl(): Scenario {
  if (typeof window === "undefined") return "base";
  const v = new URLSearchParams(window.location.search).get("mock");
  return SCENARIOS.find((s) => s === v) ?? "base";
}

// 후기 제출 기록. 서버 대신 이 기기에 저장한다(마감 뒤에는 보지 않는다)
export type Feedback = { rating: number; tags: string[]; comment: string };
const FEEDBACK_KEY = "orbit:mock-feedback";

export function loadFeedback(): Feedback | null {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    return raw ? (JSON.parse(raw) as Feedback) : null;
  } catch {
    return null;
  }
}

export function saveFeedback(f: Feedback) {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(f));
  } catch {}
}

export function mockMissions(): Missions {
  const s = scenarioFromUrl();
  const c = [...COUNTS[s]] as [number, number, number, number];
  if (s !== "closed" && loadFeedback()) c[3] = 1;
  return build(c, s === "closed");
}
