// POST /api/onboarding/consent { agreed: true }
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ agreed: z.literal(true) });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    Body.parse(await req.json());
    const consent_at = new Date().toISOString();
    const { error } = await db().from("participants").update({ consent_at }).eq("id", s.pid).is("consent_at", null);
    if (error) throw error;
    const { data } = await db().from("participants").select("consent_at").eq("id", s.pid).single();
    if (!data?.consent_at) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    await logEvent("consent", s.pid);
    return ok({ consent_at: data.consent_at });
  });
}
