// GET /api/poster/stamps  내 스탬프 목록·응모권. total 은 전체 포스터 개수(진행률 표시용)
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

type StampRow = { poster_id: number; created_at: string; posters: { title: string } | { title: string }[] | null };

export async function GET() {
  return handle(async () => {
    const s = await requireSession();

    const [stampsRes, totalRes, ticketsRes] = await Promise.all([
      db().from("stamps").select("poster_id, created_at, posters(title)").eq("participant_id", s.pid).order("created_at"),
      db().from("posters").select("id", { count: "exact", head: true }),
      db().from("raffle_tickets").select("reason, issued_at").eq("participant_id", s.pid).order("issued_at"),
    ]);
    if (stampsRes.error) throw stampsRes.error;
    if (totalRes.error) throw totalRes.error;
    if (ticketsRes.error) throw ticketsRes.error;

    const stamps = ((stampsRes.data ?? []) as unknown as StampRow[]).map((r) => {
      const p = Array.isArray(r.posters) ? r.posters[0] : r.posters;
      return { poster_id: r.poster_id, title: p?.title ?? "", created_at: r.created_at };
    });

    await logEvent("open_poster_stamps", s.pid);
    return ok({ stamps, total: totalRes.count ?? 0, tickets: ticketsRes.data ?? [] });
  });
}
