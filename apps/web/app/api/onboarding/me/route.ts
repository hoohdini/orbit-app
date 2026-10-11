// GET /api/onboarding/me  내 정보, 프로필, 주소·라벨, 테이블토크 배정(좌석 번호 포함, v0.2 H-00), 동의 상태(agreed · refused · pending)
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { getParticipant, getProfile, getSidWithLabel, getMyTable } from "@/lib/participants";
import { consentOf, shareOf } from "@/lib/consent";

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
      consent: consentOf(p),
      // 동의 두 항목(0014). 마이페이지 내 정보가 날짜와 함께 보여 준다
      consents: {
        collect: { state: consentOf(p), at: (p.consent_at ?? p.consent_refused_at ?? null) as string | null },
        share: { state: shareOf(p), at: (p.share_consent_at ?? p.share_refused_at ?? null) as string | null },
      },
      sid,
      table: table ? { table_no: table.table_no, label: table.label, version: table.version, seat_no: (table.seat_no as number | null) ?? null } : null,
    });
  });
}
