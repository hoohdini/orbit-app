// 이벤트 탭 화면이 같이 쓰는 미션 모양과 문구(피그마 E-01 ~ E-05, 10/11). 판정은 서버(/api/poster/missions, lib/missions.ts)
// 10/21 개편(피그마 이벤트 미션 페이지): 네트워킹 3줄을 명함 교환 한 줄(스탬프 2개)로 합치고 피드백 미션을 더했다. 스탬프는 5칸
export type MissionKey = "poster" | "quiz" | "exchange" | "feedback";
// milestones 는 스탬프가 찍히는 개수(명함 교환 [3, 5]). 없으면 목표(goal)를 채울 때 스탬프 1개
export type Mission = { key: MissionKey; label: string; goal: number; count: number; done: boolean; completed_at: string | null; milestones?: number[] };
// feedback_open: 행사 후기를 받는 단계인가(wrapup · award, 10/22 민찬 결정). 미션 마감 뒤에도 후기 타일만 열린다
export type Missions = { window: "not_started" | "open" | "closed"; closed_at: string | null; feedback_open: boolean; missions: Mission[]; done_count: number; total: number; progress: number; completed_all_at: string | null };

export const NO: Record<MissionKey, string> = { poster: "①", quiz: "②", exchange: "③", feedback: "④" };
export const TODO: Record<MissionKey, (m: Mission) => string> = {
  poster: (m) => `2곳 이상 관심도 남기기 · ${m.count}/${m.goal}`,
  quiz: (m) => `3개 맞히기 · ${m.count}/${m.goal}`,
  exchange: (m) => `${(m.milestones ?? [m.goal]).join("명·")}명 교환 시 스탬프 · ${m.count}/${m.goal}`,
  feedback: () => "행사 후기 남기기",
};
// 타일을 누르면 가는 곳(피그마 A01 ~ A05). 명함 교환은 중간 화면 없이 명함 탭으로 바로 간다(10/21)
export const HREF: Record<MissionKey, string> = {
  poster: "/event/posters",
  quiz: "/event/posters",
  exchange: "/card",
  feedback: "/event/feedback",
};

// 명함 교환처럼 스탬프가 여러 개인 미션이 몇 개를 받았는지
export function stampsOf(m: Mission): boolean[] {
  return (m.milestones ?? [m.goal]).map((t) => m.count >= t);
}

