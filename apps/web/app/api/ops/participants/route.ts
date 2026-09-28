// GET /api/ops/participants  이 행사 참가자 전원과 체크인 · 동의 · 주소 발급 여부 (운영자 전용). 체크인 관리 화면이 쓴다
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { selectIn } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const { data, error } = await db()
      .from("participants")
      .select("id, display_name, affiliation, role, cohort, is_host, is_admin, consent_at")
      .eq("event_id", eventId())
      .order("display_name");
    if (error) throw error;
    const people = data ?? [];
    const ids = people.map((p) => p.id as string);
    const [checkins, sids] = await Promise.all([
      selectIn<{ participant_id: string; checked_at: string; is_late: boolean }>("checkins", "participant_id, checked_at, is_late", "participant_id", ids),
      selectIn<{ participant_id: string }>("sids", "participant_id", "participant_id", ids),
    ]);
    const ci = new Map(checkins.map((c) => [c.participant_id, c]));
    const hasSid = new Set(sids.map((s) => s.participant_id));
    return ok({
      participants: people.map((p) => ({
        id: p.id,
        display_name: p.display_name,
        affiliation: p.affiliation,
        role: p.role,
        cohort: p.cohort,
        is_host: p.is_host,
        is_admin: p.is_admin,
        consented: !!p.consent_at,
        has_sid: hasSid.has(p.id as string),
        checked_at: ci.get(p.id as string)?.checked_at ?? null,
        is_late: ci.get(p.id as string)?.is_late ?? false,
      })),
    });
  });
}
