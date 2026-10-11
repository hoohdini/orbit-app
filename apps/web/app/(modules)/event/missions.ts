// 이벤트 탭 화면이 같이 쓰는 미션 모양과 문구(피그마 E-01 ~ E-05, 10/11). 판정은 서버(/api/poster/missions, lib/missions.ts)
export type MissionKey = "poster" | "quiz" | "recommended" | "first_meet" | "generation";
export type Mission = { key: MissionKey; label: string; goal: number; count: number; done: boolean; completed_at: string | null };
export type Missions = { window: "not_started" | "open" | "closed"; closed_at: string | null; missions: Mission[]; done_count: number; total: number; progress: number; completed_all_at: string | null };

export const NO: Record<MissionKey, string> = { poster: "①", quiz: "②", recommended: "③", first_meet: "④", generation: "⑤" };
export const TODO: Record<MissionKey, (m: Mission) => string> = {
  poster: (m) => `QR로 2곳 선택하기 · ${m.count}/${m.goal}`,
  quiz: (m) => `3개 맞히기 · ${m.count}/${m.goal}`,
  recommended: () => "홈 추천 1명과 QR로 명함 교환하기",
  first_meet: (m) => `첫 대화 2번 나누기 · ${m.count}/${m.goal}`,
  generation: () => "다른 구분 1명과 QR로 명함 교환하기",
};
// 타일을 누르면 가는 곳(피그마 A01 ~ A05)
export const HREF: Record<MissionKey, string> = {
  poster: "/event/posters",
  quiz: "/event/posters",
  recommended: "/event/mission/recommended",
  first_meet: "/event/mission/first_meet",
  generation: "/event/mission/generation",
};
