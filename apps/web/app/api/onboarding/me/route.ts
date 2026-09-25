// GET /api/onboarding/me  내 정보, 프로필, 주소·라벨, 테이블토크 배정
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { getParticipant, getProfile, getSidWithLabel, getMyTable } from "@/lib/participants";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const p = await getParticipant(s.pid);
    if (!p) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    const [profile, sid, table] = await Promise.all([getProfile(s.pid), getSidWithLabel(s.pid), getMyTable(s.pid, "tabletalk")]);
    return ok({
      participant: { id: p.id, display_name: p.display_name, affiliation: p.affiliation, role: p.role, cohort: p.cohort, is_host: p.is_host, is_admin: p.is_admin, visibility: p.visibility },
      profile,
      consented: !!p.consent_at,
      sid,
      table: table ? { table_no: table.table_no, label: table.label, version: table.version } : null,
    });
  });
}
