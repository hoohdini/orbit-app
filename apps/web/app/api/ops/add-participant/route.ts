// POST /api/ops/add-participant  운영자. 워크인 추가. 숫자를 주지 않으면 무작위로 만들어 한 번만 돌려준다.
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({
  display_name: z.string().trim().min(1).max(20),
  affiliation: z.string().trim().max(40).optional(),
  role: z.enum(["student", "alumni", "professor", "staff", "other"]).default("student"),
  cohort: z.number().int().optional(),
  is_host: z.boolean().default(false),
  pin: z.string().regex(/^\d{4}$/).optional(),
  offer_text: z.string().max(120).default(""),
  seek_text: z.string().max(120).default(""),
  topic_tags: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const pin = b.pin ?? String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const hash = await bcrypt.hash(pin, 10);
    const { data: p, error } = await db()
      .from("participants")
      .insert({ event_id: eventId(), display_name: b.display_name, affiliation: b.affiliation ?? null, role: b.role, cohort: b.cohort ?? null, is_host: b.is_host, login_pin_hash: hash })
      .select("id, display_name, affiliation, role, cohort")
      .single();
    if (error) throw error;
    const { error: e2 } = await db().from("profiles").insert({ participant_id: p.id, offer_text: b.offer_text, seek_text: b.seek_text, topic_tags: b.topic_tags });
    if (e2) throw e2;
    await logEvent("walkin_added", admin.pid, { target: p.id });
    return ok({ participant: p, pin }, 201);
  });
}
