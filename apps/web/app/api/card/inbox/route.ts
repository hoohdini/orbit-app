// GET /api/card/inbox  아직 보지 않은 "OO 님에게 명함이 공유되었습니다" 알림. 상대가 나를 찍어서 받은 명함이다
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { cardsOf, myExchanges } from "../_server";
import { sharedMessage } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const rows = (await myExchanges(s.pid)).filter((r) => r.source === "auto" && r.seen_at === null);
    const cards = await cardsOf(rows);
    const idOf = new Map(rows.map((r) => [r.scanned_id, r.id]));
    return ok({
      new: cards.map((c) => ({ exchange_id: idOf.get(c.id) ?? null, message: sharedMessage(c.display_name), card: c })),
      count: cards.length,
    });
  });
}
