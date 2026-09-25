import { ok, handle } from "@/lib/api";
import { clearSession, getSession } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const s = await getSession();
    await clearSession();
    if (s) await logEvent("logout", s.pid);
    return ok({ ok: true });
  });
}
