// GET /api/card/inbox  아직 보지 않은 "OO 님에게 명함이 공유되었습니다" 알림. 상대가 나를 찍어서 받은 명함이다
// 개발 지시서 v0.2 H-05: 성립한 교환만 new 에 넣고, 찍힌 쪽도 미션 ③ 을 올릴 수 있도록 ask_first_meet 를 붙인다.
// 상대가 이름 검색으로 보낸 확인 대기 교환은 requests 에 따로 준다(OO님과 명함을 교환하셨나요? → /api/card/confirm).
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { cardsOf, myExchanges } from "../_server";
import { sharedMessage } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const mine = await myExchanges(s.pid);
    const rows = mine.filter((r) => r.source === "auto" && r.status === "confirmed" && r.seen_at === null);
    const pending = mine.filter((r) => r.source === "auto" && r.status === "pending");
    const [cards, reqCards] = await Promise.all([cardsOf(rows), cardsOf(pending)]);
    const rowOf = new Map(rows.map((r) => [r.scanned_id, r]));
    const reqOf = new Map(pending.map((r) => [r.scanned_id, r]));
    return ok({
      new: cards.map((c) => ({
        exchange_id: rowOf.get(c.id)?.id ?? null,
        message: sharedMessage(c.display_name),
        card: c,
        ask_first_meet: (rowOf.get(c.id)?.first_meet_at ?? null) === null,
      })),
      count: cards.length,
      requests: reqCards.map((c) => ({ exchange_id: reqOf.get(c.id)?.id ?? null, message: `${c.display_name}님과 명함을 교환하셨나요?`, card: c })),
    });
  });
}
