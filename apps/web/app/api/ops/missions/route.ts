// GET /api/ops/missions  이벤트 · 미션 · 시상 현황(개발 지시서 v0.2 A-07, 결정 12). 운영자만.
// 체크인한 사람 기준 평균 스탬프 수(avg_stamps)와 평균 진행도, 스탬프 5칸 모두 찍은 사람 수, 미션별 완료자 수, 특별 시상 후보(제외 명단을 뺀 10위까지, 10위 공동이면 모두. 10/31 성하. 시상 5명 = 10/25 민찬 결정)와 수상 자리 나눔(award: 확정 · 경계 공동 순위 추첨, 10/25 민찬 결정), QR 처리 수와 탭 불일치 수.
// 미션은 4종 · 스탬프 5칸(① 포스터 1 · ② 퀴즈 1 · ③ 명함 교환 2 · ④ 후기 1, lib/missions.ts).
// 시상 순서(10/23 민찬 결정, lib/award.ts): 스탬프 수 많은 순 → 추천 인물과의 교환 수(최대 5) 많은 순 → 유효 포스터 응답 수(5초 이상) 많은 순 → 그래도 같으면 공동 순위.
// 시각 기준(5번째 스탬프 시각 등)은 서두르게 만들어서 쓰지 않는다. 공동 순위는 place 가 같고 tied true 다.
// 이용 동의(수집)를 거부한 사람은 후보에서 뺀다. 동의했다가 나중에 거부하면 그 전 기록이 남아 있을 수 있어서다.
// 명함 공개(share)만 거부한 사람은 뺀다는 결정이 없고 포스터 · 퀴즈 · 후기 미션은 그대로 할 수 있으므로 남긴다(refusedAmong 은 share 거부자까지 빼서 쓰지 않는다).
// 전체 교환 수는 쓰지 않는다(명찰 QR 을 찍기만 해도 늘어서). 제외 명단(현장 운영진, 모델링팀)은 /api/ops/award-exclude 로 올린다.
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { opsSnapshot } from "@/lib/opsState";
import { missionWindow } from "@/lib/phase";
import { MISSIONS, STAMP_TOTAL, missionStatuses, checkedInIds } from "@/lib/missions";
import { AWARD_SEATS, splitSeats } from "@/lib/award";
import { opsGet, eventParticipantIds, awardRanking, type AwardDraw } from "../_lib";

export const dynamic = "force-dynamic";

// 후보 표는 10위까지 보인다(10/31 성하: 운영진이 표를 보고 직접 고른다). 10위가 공동이면 공동인 사람을 모두 보인다.
// 수상 자리 나눔(award)은 그대로 5명(AWARD_SEATS) 기준이다
const SHOW = 10;
const SCAN_PAGE = 1000;

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const ev = eventId();
    const [ops, ids, saved] = await Promise.all([opsSnapshot(), checkedInIds(ev), opsGet<AwardDraw>("award_draw")]);
    const stat = await missionStatuses(ids, ops.missionClosedAt);
    const rows = [...stat.entries()];
    const { excluded, ranked } = await awardRanking(ids, stat);

    const candidates = ranked
      .filter((c) => c.place <= SHOW)
      .map((c) => ({
        place: c.place,
        tied: c.tied,
        id: c.id,
        display_name: c.name,
        affiliation: c.affiliation,
        progress: c.progress,
        done_count: c.stamps,
        recommended_exchanges: c.recommended,
        valid_poster_responses: c.poster,
      }));

    // 수상 자리 나눔(10/25 민찬 결정). 경계의 공동 순위 묶음을 다 넣으면 5명을 넘을 때만 draw 가 있다.
    // result 는 저장된 마지막 추첨 결과 그대로다(지금 draw 와 대상이 다를 수 있다. 콘솔이 lib/award.ts sameDraw 로 맞는지 본다)
    const seats = splitSeats(ranked, AWARD_SEATS);
    const award = {
      seats: AWARD_SEATS,
      sure: seats.sure.map((c) => c.id),
      draw: seats.drawGroup.length ? { place: seats.drawGroup[0].place, pool: seats.drawGroup.map((c) => c.id), count: seats.drawCount } : null,
      result: saved ? { at: saved.at, place: saved.place, picked: saved.picked, pool: saved.pool } : null,
    };

    // QR 처리 수와 탭 불일치 수. 명함 QR 을 이벤트 탭에서, 포스터 QR 을 명함 탭에서 읽은 경우가 불일치다
    const all = await eventParticipantIds();
    // 스캔 기록은 1000행(Supabase 기본 최대)을 넘을 수 있어 id 순으로 끝까지 읽는다
    const list: { kind: string; payload: unknown }[] = [];
    for (let from = 0; ; from += SCAN_PAGE) {
      const { data, error } = await db().from("event_log").select("kind, payload").in("kind", ["card_scan", "poster_scan"]).in("participant_id", all).order("id").range(from, from + SCAN_PAGE - 1);
      if (error) throw error;
      list.push(...((data ?? []) as { kind: string; payload: unknown }[]));
      if (!data || data.length < SCAN_PAGE) break;
    }
    const mismatch = list.filter((r) => {
      const via = (r.payload as { via?: string } | null)?.via;
      return (r.kind === "card_scan" && via === "event") || (r.kind === "poster_scan" && via === "card");
    }).length;

    const n = rows.length;
    return ok({
      window: missionWindow(ops.phase),
      closed_at: ops.missionClosedAt,
      checked_in: n,
      stamp_total: STAMP_TOTAL,
      avg_stamps: n ? Math.round((rows.reduce((s, [, m]) => s + m.done_count, 0) / n) * 10) / 10 : null,
      avg_progress: n ? Math.round((rows.reduce((s, [, m]) => s + m.progress, 0) / n) * 1000) / 1000 : null,
      completed_all: rows.filter(([, m]) => m.done_count === m.total).length,
      by_mission: MISSIONS.map((ms) => ({ key: ms.key, label: ms.label, done: rows.filter(([, m]) => m.missions.find((x) => x.key === ms.key)?.done).length })),
      excluded,
      candidates,
      award,
      qr: { card_scans: list.filter((r) => r.kind === "card_scan").length, poster_scans: list.filter((r) => r.kind === "poster_scan").length, tab_mismatch: mismatch },
    });
  });
}
