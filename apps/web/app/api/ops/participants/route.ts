// GET /api/ops/participants  이 행사 참가자 전원과 체크인 · 동의 · 주소 발급 여부 (운영자 전용). 체크인 관리 화면이 쓴다
// coffee_late = 커피챗 공개 뒤 늦게 와서 공개된 커피챗에 자리를 받은 사람의 {table_no, seat_no, fallback}(10/25, 의자를 더 놓으라는 표시). 아니면 null
// coffee_skip = 커피챗 불참으로 정해 둔 사람(ops_state coffeechat_skip, 10/27 민찬 결정). 체크인해도 커피챗 자리를 받지 않는다
// left_at · left_self = 일찍 나간다고 표시한 시각과 본인이 눌렀는지(false 면 운영자가 표시, 0019 · 10/25 민찬 결정). 표시 안 했으면 null · false
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { leftOf } from "@/lib/checkinLeft";
import { readOps, COFFEECHAT_SKIP_KEY, coffeechatSkip } from "@/lib/opsState";
import { selectIn } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const { data, error } = await db()
      .from("participants")
      .select("id, display_name, affiliation, role, cohort, is_host, is_admin, consent_at, consent_refused_at")
      .eq("event_id", eventId())
      .order("display_name");
    if (error) throw error;
    const people = data ?? [];
    const ids = people.map((p) => p.id as string);
    const [checkins, sids, cc, left, ops] = await Promise.all([
      selectIn<{ participant_id: string; checked_at: string; is_late: boolean }>("checkins", "participant_id, checked_at, is_late", "participant_id", ids),
      selectIn<{ participant_id: string }>("sids", "participant_id", "participant_id", ids),
      db().from("assign_versions").select("version").eq("event_id", eventId()).eq("round", "coffeechat").eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle(),
      leftOf(ids), // 0019 전 DB 면 빈 Map(아무도 안 나감)
      readOps([COFFEECHAT_SKIP_KEY]),
    ]);
    const skip = coffeechatSkip(ops[COFFEECHAT_SKIP_KEY]);
    if (cc.error) throw cc.error;
    // 공개된 커피챗 버전(화면 current_tables 와 같은 버전)에서 reason.late_join 인 자리만
    const ccVersion = cc.data?.version as number | undefined;
    const { data: lateRows, error: lErr } = ccVersion
      ? await db().from("table_members").select("participant_id, table_no, seat_no, reason").eq("version", ccVersion).eq("reason->>late_join", "true")
      : { data: [], error: null };
    if (lErr) throw lErr;
    const coffeeLate = new Map(
      (lateRows ?? []).map((r) => [r.participant_id as string, { table_no: r.table_no as number, seat_no: (r.seat_no as number | null) ?? null, fallback: !!(r.reason as { fallback?: boolean } | null)?.fallback }]),
    );
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
        consent_refused: !!p.consent_refused_at,
        has_sid: hasSid.has(p.id as string),
        checked_at: ci.get(p.id as string)?.checked_at ?? null,
        is_late: ci.get(p.id as string)?.is_late ?? false,
        left_at: left.get(p.id as string)?.left_at ?? null,
        left_self: left.has(p.id as string) && !left.get(p.id as string)?.left_by,
        coffee_late: coffeeLate.get(p.id as string) ?? null,
        coffee_skip: skip.has((p.id as string).toLowerCase()),
      })),
    });
  });
}
