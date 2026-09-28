// GET /api/ops/poster  포스터세션 현황 (운영자 전용). 포스터별 스탬프 · 관심도 답, 응모권, 마지막 추첨 결과
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
      selectIn<{ poster_id: number; choice: string }>("poster_interest", "poster_id, choice", "participant_id", ids),
      selectIn<{ participant_id: string; reason: string }>("raffle_tickets", "participant_id, reason", "participant_id", ids),
      opsGet<RaffleResult>("raffle_result"),
    ]);
    const stampCount = new Map<number, number>();
    for (const s of stamps) stampCount.set(s.poster_id, (stampCount.get(s.poster_id) ?? 0) + 1);
    const interestCount = new Map<number, Record<string, number>>();
    for (const i of interest) {
      const m = interestCount.get(i.poster_id) ?? {};
      m[i.choice] = (m[i.choice] ?? 0) + 1;
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
