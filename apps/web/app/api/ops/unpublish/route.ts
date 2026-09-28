// POST /api/ops/unpublish { version }  공개한 배정을 철회한다 (운영자 전용). 비상용.
// 철회하면 그 라운드는 공개 버전이 없는 상태가 되어 참가자 화면에 배정이 안 보인다. 다시 보이게 하려면 새 초안을 공개한다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { opsSet } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ version: z.number().int().positive() });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { version } = Body.parse(await req.json());
    const { data: v, error } = await db().from("assign_versions").select("version, round, status").eq("version", version).eq("event_id", eventId()).maybeSingle();
    if (error) throw error;
    if (!v) return fail("NOT_FOUND", "이 행사의 배정 버전이 아니다", 404);
    if (v.status !== "published") return fail("NOT_PUBLISHED", "공개 중인 버전이 아니다", 409);

    const { error: e2 } = await db().from("assign_versions").update({ status: "retired" }).eq("version", version);
    if (e2) throw e2;
    await opsSet(`published_${v.round}`, { version: null, at: new Date().toISOString(), by: admin.pid, unpublished: version });
    await logEvent("ops_unpublish", admin.pid, { version, round: v.round });
    return ok({ retired: version, round: v.round });
  });
}
