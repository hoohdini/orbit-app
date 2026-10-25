// 특별 시상 순위(10/23 민찬 결정). 공개 규칙이고, 서두르게 만들지 않으려고 시각 기준은 쓰지 않는다.
// 1) 스탬프 수(0~5) 많은 순 2) 추천 인물과의 교환 수(최대 5) 많은 순 3) 유효 포스터 응답 수(5초 이상) 많은 순
// 셋이 모두 같으면 공동 순위다(같은 순위 번호, tied true). 다음 순위는 사람 수만큼 건너뛴다(1 · 1 · 3).
// 공동 순위 안의 표시 순서는 이름 순 → id 순으로 고정한다(새로고침해도 줄이 바뀌지 않게, 구현하며 정함). 순위에는 영향이 없다.
// DB 를 읽지 않는 순수 함수다(값은 lib/missions.ts 가 계산한다).
export type AwardInput = { id: string; name: string; stamps: number; recommended: number; poster: number };
export type AwardRanked<T extends AwardInput> = T & { place: number; tied: boolean };

const cmpScore = (a: AwardInput, b: AwardInput) => b.stamps - a.stamps || b.recommended - a.recommended || b.poster - a.poster;

export function rankAward<T extends AwardInput>(rows: T[]): AwardRanked<T>[] {
  const sorted = [...rows].sort((a, b) => cmpScore(a, b) || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
  const out: AwardRanked<T>[] = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    const same = !!prev && cmpScore(prev, r) === 0;
    out.push({ ...r, place: same ? prev.place : i + 1, tied: same });
    if (same) prev.tied = true;
  });
  return out;
}

export const AWARD_SEATS = 5; // 시상 5명(10/25 민찬 결정)

// 상 자리(seats, 시상 5명 = 10/25 민찬 결정)에 순위표를 나눈다. 공동 순위 묶음이 통째로 들어가면 확정(sure),
// 경계의 공동 순위 묶음을 다 넣으면 자리를 넘으면 그 묶음(drawGroup) 안에서 남은 자리 수(drawCount)만큼 추첨한다(10/25 민찬 결정).
// 예: 순위 1 · 2 · 3 · 4 · 4 · 4, 5자리 → 확정 3명, 공동 4위 3명 중 2명 추첨. 사람이 자리보다 적으면 모두 확정.
export function splitSeats<T extends { place: number }>(ranked: T[], seats: number): { sure: T[]; drawGroup: T[]; drawCount: number } {
  const sure: T[] = [];
  for (let i = 0; i < ranked.length && sure.length < seats; ) {
    const group = ranked.filter((r) => r.place === ranked[i].place);
    if (sure.length + group.length > seats) return { sure, drawGroup: group, drawCount: seats - sure.length };
    sure.push(...group);
    i += group.length;
  }
  return { sure, drawGroup: [], drawCount: 0 };
}

// 저장된 추첨 결과가 지금 추첨 대상(같은 순위 · 같은 사람들)과 맞는지. 순위가 바뀌어 대상이 달라졌으면 false
export function sameDraw(saved: { place: number; pool: string[] } | null, cur: { place: number; pool: string[] } | null): boolean {
  if (!saved || !cur || saved.place !== cur.place || saved.pool.length !== cur.pool.length) return false;
  const a = new Set(saved.pool);
  return cur.pool.every((id) => a.has(id));
}
