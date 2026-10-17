// GET /api/ops/poster  포스터세션 현황 (운영자 전용). 포스터별 스탬프 · 관심 포스터 응답, 응모권, 마지막 추첨 결과
// interest = 관심 포스터 응답(poster_responses.reason, 0011 흥미 3단계 want · maybe · not_mine)의 포스터별 수.
// 예전에는 0009 전 표 poster_interest 를 셌는데, 0009 부터 새 응답은 poster_responses 에만 쌓여 늘 0 이 나왔다(10/17 웹 점검)
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { eventParticipantIds, selectIn, opsGet, type RaffleResult } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const [{ data: posters, error }, ids] = await Promise.all([db().from("posters").select("id, code, title, presenter, booth").order("code"), eventParticipantIds()]);
    if (error) throw error;
    const [stamps, interest, tickets, raffle] = await Promise.all([
      selectIn<{ participant_id: string; poster_id: number }>("stamps", "participant_id, poster_id", "participant_id", ids),
      selectIn<{ poster_id: number; reason: string }>("poster_responses", "poster_id, reason", "participant_id", ids),
      selectIn<{ participant_id: string; reason: string }>("raffle_tickets", "participant_id, reason", "participant_id", ids),
      opsGet<RaffleResult>("raffle_result"),
    ]);
    const stampCount = new Map<number, number>();
    for (const s of stamps) stampCount.set(s.poster_id, (stampCount.get(s.poster_id) ?? 0) + 1);
    const interestCount = new Map<number, Record<string, number>>();
    for (const i of interest) {
      const m = interestCount.get(i.poster_id) ?? {};
      m[i.reason] = (m[i.reason] ?? 0) + 1;
      interestCount.set(i.poster_id, m);
    }
    return ok({
      posters: (posters ?? []).map((p) => ({ ...p, stamps: stampCount.get(p.id as number) ?? 0, interest: interestCount.get(p.id as number) ?? {} })),
      stamps_total: stamps.length,
      people_with_stamps: new Set(stamps.map((s) => s.participant_id)).size,
      tickets_total: tickets.length,
      people_with_tickets: new Set(tickets.map((t) => t.participant_id)).size,
      raffle,
    });
  });
}
