// POST /api/onboarding/login  { display_name, pin, participant_id? }
// 이름으로 후보 전원을 찾아 숫자 4자리를 비교한다. 한 명만 맞으면 로그인, 둘 이상이면 소속 선택 목록을 돌려준다.
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { setSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { ensureCheckin } from "@/lib/participants";

export const dynamic = "force-dynamic";

const Body = z.object({
  display_name: z.string().trim().min(1).max(20),
  pin: z.string().regex(/^\d{4}$/, "숫자 4자리"),
  participant_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "uuid 형식").optional(),
});

const LOCK_MAX = 5;
const LOCK_MINUTES = 10;

async function failCount(name: string): Promise<number> {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();
  const { count, error } = await db()
    .from("event_log")
    .select("id", { count: "exact", head: true })
    .eq("kind", "login_fail")
    .eq("payload->>display_name", name)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    const name = body.display_name;

    if ((await failCount(name)) >= LOCK_MAX) {
      await logEvent("login_locked", null, { display_name: name });
      return fail("LOCKED", `${LOCK_MINUTES}분 뒤에 다시 시도한다`, 423);
    }

    let q = db()
      .from("participants")
      .select("id, display_name, affiliation, role, cohort, is_admin, consent_at, login_pin_hash")
      .eq("event_id", eventId())
      .eq("display_name", name);
    if (body.participant_id) q = q.eq("id", body.participant_id);
    const { data: candidates, error } = await q;
    if (error) throw error;

    const matched = [];
    for (const c of candidates ?? []) {
      if (c.login_pin_hash && (await bcrypt.compare(body.pin, c.login_pin_hash))) matched.push(c);
    }

    if (matched.length === 0) {
      await logEvent("login_fail", null, { display_name: name, candidates: (candidates ?? []).length });
      return fail("INVALID", "이름 또는 숫자가 다르다", 401);
    }

    if (matched.length > 1) {
      return ok({
        choose: matched.map((c) => ({ id: c.id, display_name: c.display_name, affiliation: c.affiliation, role: c.role, cohort: c.cohort })),
      });
    }

    const p = matched[0];
    await ensureCheckin(p.id);
    await setSession({ pid: p.id, admin: !!p.is_admin });
    await logEvent("login_ok", p.id, { ua: req.headers.get("user-agent") ?? "" });
    return ok({
      participant: { id: p.id, display_name: p.display_name, role: p.role, is_admin: !!p.is_admin },
      consented: !!p.consent_at,
    });
  });
}
