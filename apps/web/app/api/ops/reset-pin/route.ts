// POST /api/ops/reset-pin { participant_id }  운영자. 새 무작위 4자리를 발급해 한 번만 돌려준다.
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ participant_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "uuid 형식") });

function randomPin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { participant_id } = Body.parse(await req.json());
    const pin = randomPin();
    const hash = await bcrypt.hash(pin, 10);
    const { data, error } = await db().from("participants").update({ login_pin_hash: hash }).eq("id", participant_id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    await logEvent("pin_reset", admin.pid, { target: participant_id });
    return ok({ pin });
  });
}
