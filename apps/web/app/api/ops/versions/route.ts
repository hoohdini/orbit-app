// GET /api/ops/versions  이 행사(EVENT_ID)의 배정 버전 목록, 최신 20개 (운영자 전용, 담당: 민찬)
// 계산 버튼이 만든 초안을 확인하고 공개하는 데 쓴다. params 에서 운영진이 볼 요약만 뽑는다.
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEEP = ["kind", "n", "reuse_codebook", "response_rate", "fallback", "forbid_hits", "cohort_over", "poster_people"] as const;

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const { data, error } = await db()
      .from("assign_versions")
      .select("version, round, status, params, created_at, published_at")
      .eq("event_id", eventId())
      .order("version", { ascending: false })
      .limit(20);
    if (error) throw error;
    const versions = (data ?? []).map((v) => {
      const p = (v.params ?? {}) as Record<string, unknown>;
      return {
        version: v.version as number,
        round: v.round as string,
        status: v.status as string,
        created_at: v.created_at as string,
        published_at: v.published_at as string | null,
        summary: Object.fromEntries(KEEP.filter((k) => k in p).map((k) => [k, p[k]])),
      };
    });
    return ok({ versions });
  });
}
