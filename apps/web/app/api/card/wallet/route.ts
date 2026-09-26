// GET /api/card/wallet  내가 가진 명함 전부(최근 순). 내가 찍은 것과 받은 것을 source 로 구분한다
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { cardsOf, myExchanges } from "../_server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const rows = await myExchanges(s.pid);
    const cards = await cardsOf(rows);
    await logEvent("open_wallet", s.pid);
    return ok({ cards, received_count: rows.filter((r) => r.source === "auto").length });
  });
}
