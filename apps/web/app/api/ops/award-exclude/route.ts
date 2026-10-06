// GET  /api/ops/award-exclude  특별 시상 제외 명단(개발 지시서 v0.2 E-06). 운영자만.
// POST /api/ops/award-exclude { csv?, ids? }  명단을 통째로 바꾼다. csv 는 한 줄에 이름,소속(소속은 생략 가능, 첫 줄이 이름 이면 머리줄로 보고 건너뜀).
// 이름이 이 행사에 없거나 동명이인인데 소속이 없어 하나로 못 정하면 unmatched 로 돌려준다. 포스터 발표자는 제외하지 않는다(참여 가능).
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { opsGet, opsSet, UUID } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ csv: z.string().max(20000).optional(), ids: z.array(z.string().regex(UUID)).max(500).optional() });

async function listOf(ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await db().from("participants").select("id, display_name, affiliation").in("id", ids);
  if (error) throw error;
  return data ?? [];
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const cur = await opsGet<{ ids: string[]; at: string }>("award_excluded");
    return ok({ people: await listOf(cur?.ids ?? []), at: cur?.at ?? null });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const ids = new Set((b.ids ?? []).map((x) => x.toLowerCase()));
    const unmatched: string[] = [];

    if (b.csv) {
      const { data: people, error } = await db().from("participants").select("id, display_name, affiliation").eq("event_id", eventId());
      if (error) throw error;
      const lines = b.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const [i, line] of lines.entries()) {
        const [name, aff] = line.split(",").map((x) => x.trim());
        if (i === 0 && name === "이름") continue;
        const hit = (people ?? []).filter((p) => p.display_name === name && (!aff || p.affiliation === aff));
        if (hit.length === 1) ids.add(hit[0].id as string);
        else unmatched.push(line);
      }
    }

    const at = new Date().toISOString();
    await opsSet("award_excluded", { ids: [...ids], at, by: admin.pid });
    await logEvent("ops_award_exclude", admin.pid, { count: ids.size, unmatched: unmatched.length });
    return ok({ people: await listOf([...ids]), unmatched, at });
  });
}
