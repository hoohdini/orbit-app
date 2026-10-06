// GET /api/card/me  내 명함, 명찰 QR 문자열, 명함함 수, 안 본 알림 수
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { appOrigin, buildMyCard, qrPayloadFor } from "../_server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const [card, wallet, unseen, me] = await Promise.all([
      buildMyCard(s.pid),
      db().from("card_exchanges").select("id", { count: "exact", head: true }).eq("scanner_id", s.pid),
      db().from("card_exchanges").select("id", { count: "exact", head: true }).eq("scanner_id", s.pid).eq("source", "auto").eq("status", "confirmed").is("seen_at", null),
      db().from("participants").select("visibility").eq("id", s.pid).maybeSingle(),
    ]);
    if (!card) return fail("NOT_FOUND", "참가자를 찾을 수 없다", 404);
    if (wallet.error) throw wallet.error;
    if (unseen.error) throw unseen.error;
    if (me.error) throw me.error;

    await logEvent("open_card", s.pid);
    return ok({
      card,
      visibility: (me.data?.visibility as string) ?? "scanned",
      qr_payload: qrPayloadFor(appOrigin(req), s.pid),
      wallet_count: wallet.count ?? 0,
      unseen_count: unseen.count ?? 0,
    });
  });
}
