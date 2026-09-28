// GET /api/coffeechat/recs  이 행사(EVENT_ID)에서 published 된 최신 coffeechat 배정 버전의 내 추천 목록
import { ok, handle, eventId } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();

    const { data: latest, error: verErr } = await db()
      .from("assign_versions")
      .select("version")
      .eq("round", "coffeechat")
      .eq("event_id", eventId())
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verErr) throw verErr;
    if (!latest) return ok({ recs: [] });

    const { data: recRows, error } = await db()
      .from("recs")
      .select("rank, target_id, reason")
      .eq("version", latest.version)
      .eq("participant_id", s.pid)
      .order("rank");
    if (error) throw error;
    if (!recRows || recRows.length === 0) return ok({ recs: [] });

    const targetIds = recRows.map((r) => r.target_id as string);
    const [people, tables] = await Promise.all([
      db().from("participants").select("id, display_name, affiliation").in("id", targetIds),
      db().from("current_tables").select("participant_id, table_no").eq("round", "coffeechat").in("participant_id", targetIds),
    ]);
    if (people.error) throw people.error;
    if (tables.error) throw tables.error;

    const peopleOf = new Map((people.data ?? []).map((p) => [p.id as string, p]));
    const tableOf = new Map((tables.data ?? []).map((t) => [t.participant_id as string, t.table_no as number]));

    const recs = recRows.map((r) => {
      const target = peopleOf.get(r.target_id as string);
      return {
        rank: r.rank,
        target: { id: r.target_id, display_name: target?.display_name ?? "", affiliation: target?.affiliation ?? null },
        current_table_no: tableOf.get(r.target_id as string) ?? null,
        reason: r.reason,
      };
    });

    await logEvent("open_coffeechat_recs", s.pid);
    return ok({ recs });
  });
}
