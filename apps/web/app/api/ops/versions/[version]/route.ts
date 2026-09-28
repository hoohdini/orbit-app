// GET /api/ops/versions/<version>  배정 버전 하나의 테이블별 구성원과 사람별 배정 이유 (운영자 전용, 담당: 민찬)
// 공개하기 전에 운영진이 배정을 확인하는 데 쓴다(9/27 회의: 운영진 더블체크). 이유는 계산 서비스가 table_members.reason 에 남긴 것이다.
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Reason = { text?: string; random?: boolean } | null;

export async function GET(_req: Request, { params }: { params: Promise<{ version: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const version = Number.parseInt((await params).version, 10);
    if (!Number.isFinite(version)) return fail("BAD_INPUT", "버전 번호가 아니다", 400);

    const { data: v, error: vErr } = await db()
      .from("assign_versions")
      .select("version, round, status")
      .eq("version", version)
      .eq("event_id", eventId())
      .maybeSingle();
    if (vErr) throw vErr;
    if (!v) return fail("NOT_FOUND", "이 행사의 배정 버전이 아니다", 404);

    const { data: rows, error } = await db()
      .from("table_members")
      .select("table_no, participant_id, reason")
      .eq("version", version)
      .order("table_no");
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.participant_id as string);
    const { data: people, error: pErr } = ids.length
      ? await db().from("participants").select("id, display_name, affiliation, role").in("id", ids)
      : { data: [], error: null };
    if (pErr) throw pErr;
    const who = new Map((people ?? []).map((p) => [p.id as string, p]));

    const tables = new Map<number, { table_no: number; members: { id: string; display_name: string; affiliation: string | null; role: string; random: boolean; reason: string }[] }>();
    for (const r of rows ?? []) {
      const t = r.table_no as number;
      if (!tables.has(t)) tables.set(t, { table_no: t, members: [] });
      const p = who.get(r.participant_id as string);
      const reason = r.reason as Reason;
      tables.get(t)!.members.push({
        id: r.participant_id as string,
        display_name: (p?.display_name as string) ?? "",
        affiliation: (p?.affiliation as string | null) ?? null,
        role: (p?.role as string) ?? "",
        random: !!reason?.random,
        reason: reason?.text ?? "",
      });
    }
    return ok({ version: v.version, round: v.round, status: v.status, tables: [...tables.values()] });
  });
}
