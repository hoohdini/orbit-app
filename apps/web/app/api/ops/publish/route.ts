// POST /api/ops/publish { version }  배정 버전을 참가자에게 공개한다 (운영자 전용, 담당: 민찬)
// 같은 행사 · 같은 라운드에서 먼저 공개돼 있던 버전은 retired 로 바꿔 공개 버전을 하나만 둔다.
// 화면(current_tables)은 라운드 · 행사별 최신 published 만 보므로 공개하는 즉시 참가자 화면이 바뀐다.
import { z } from "zod";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ version: z.number().int().positive() });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireAdmin();
    const b = Body.parse(await req.json());
    const ev = eventId();

    const { data: v, error } = await db()
      .from("assign_versions")
      .select("version, round, status, published_at")
      .eq("version", b.version)
      .eq("event_id", ev)
      .maybeSingle();
    if (error) throw error;
    if (!v) return fail("NOT_FOUND", "이 행사의 배정 버전이 아니다", 404);
    if (v.status === "published") return ok({ published_at: v.published_at });

    const { error: rErr } = await db()
      .from("assign_versions")
      .update({ status: "retired" })
      .eq("event_id", ev)
      .eq("round", v.round)
      .eq("status", "published");
    if (rErr) throw rErr;

    const published_at = new Date().toISOString();
    const { error: pErr } = await db().from("assign_versions").update({ status: "published", published_at }).eq("version", b.version);
    if (pErr) throw pErr;

    await logEvent("ops_publish", s.pid, { version: b.version, round: v.round });
    return ok({ published_at });
  });
}
