// POST /api/ops/publish { version }  초안 배정을 공개한다. 같은 라운드의 이전 공개 버전은 철회(retired)로 돌린다.
// 계산 서비스는 초안만 만들고, 공개는 운영자가 확인한 뒤 여기서 한다(9/29 결정). 참가자 화면은 30초 폴링이라 곧바로 반영된다.
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
    const ev = eventId();

    const { data: v, error } = await db().from("assign_versions").select("version, round, status, event_id").eq("version", version).maybeSingle();
    if (error) throw error;
    if (!v || v.event_id !== ev) return fail("NOT_FOUND", "이 행사의 배정 버전이 아니다", 404);
    if (v.status === "published") return fail("ALREADY_PUBLISHED", "이미 공개된 버전이다", 409);
    if (v.status === "retired") return fail("RETIRED", "철회된 버전은 다시 공개하지 않는다. 새로 계산한다", 409);

    // 같은 라운드의 이전 공개 버전을 철회한다. current_tables 는 최신 published 만 보지만, 목록에서도 하나만 공개로 보이게 한다
    const { data: prev, error: e1 } = await db()
      .from("assign_versions")
      .update({ status: "retired" })
      .eq("event_id", ev)
      .eq("round", v.round)
      .eq("status", "published")
      .select("version");
    if (e1) throw e1;

    const published_at = new Date().toISOString();
    const { error: e2 } = await db().from("assign_versions").update({ status: "published", published_at }).eq("version", version);
    if (e2) throw e2;

    await opsSet(`published_${v.round}`, { version, at: published_at, by: admin.pid });
    await logEvent("publish", admin.pid, { version, round: v.round, retired: (prev ?? []).map((p) => p.version) });
    return ok({ published_at, round: v.round, retired: (prev ?? []).map((p) => p.version as number) });
  });
}
