// GET /api/ops/versions  이 행사(EVENT_ID)의 배정 버전 목록(최신 순). 초안 · 공개 · 철회 전부. params 는 계산 서비스가 남긴 요약 그대로
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const { data, error } = await db()
      .from("assign_versions")
      .select("version, round, status, params, created_at, published_at")
      .eq("event_id", eventId())
      .order("version", { ascending: false });
    if (error) throw error;
    return ok({ versions: data ?? [] });
  });
}
