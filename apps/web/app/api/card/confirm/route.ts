// POST /api/card/confirm { exchange_id, accept }  이름 검색 교환 확인(개발 지시서 v0.2 H-05-BE2).
// 상대가 이름 검색으로 나와 교환하면 내 쪽에 확인 대기 행(source auto, status pending)이 생기고 받은 명함 알림(/api/card/inbox 의 requests)에 뜬다.
// accept true 면 두 행을 성립(confirmed)으로, false 면 두 행을 지운다. 성립 전 교환은 미션 · 추천 계산 어디에도 세지 않는다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";

export const dynamic = "force-dynamic";

const Body = z.object({ exchange_id: z.number().int().positive(), accept: z.boolean() });

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const guard = await collectGuard(s.pid);
    if (guard) return guard;

    const { data: row, error } = await db()
      .from("card_exchanges")
      .select("id, scanner_id, scanned_id, status")
      .eq("id", b.exchange_id)
      .eq("scanner_id", s.pid)
      .maybeSingle();
    if (error) throw error;
    if (!row) return fail("NOT_FOUND", "내가 받은 교환 요청이 아니다", 404);
    if (row.status !== "pending") return fail("NOT_PENDING", "이미 성립한 교환이다", 409);

    const other = row.scanned_id as string;
    const pair = `and(scanner_id.eq.${s.pid},scanned_id.eq.${other}),and(scanner_id.eq.${other},scanned_id.eq.${s.pid})`;
    if (b.accept) {
      const confirmed_at = new Date().toISOString();
      const { error: e } = await db().from("card_exchanges").update({ status: "confirmed", confirmed_at }).eq("status", "pending").or(pair);
      if (e) throw e;
      await logEvent("card_confirm", s.pid, { target_id: other });
      return ok({ status: "confirmed", confirmed_at });
    }
    const { error: e } = await db().from("card_exchanges").delete().eq("status", "pending").or(pair);
    if (e) throw e;
    await logEvent("card_reject", s.pid, { target_id: other });
    return ok({ status: "rejected", confirmed_at: null });
  });
}
