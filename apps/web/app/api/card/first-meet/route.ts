// POST /api/card/first-meet { target_id, first_meet, note? }  오늘 처음 대화한 분인가요? 와 한 줄 남기기(개발 지시서 v0.2 H-05, 미션 ③).
// 교환 결과 화면(찍은 쪽)과 받은 명함 알림(찍힌 쪽)에서 각자 한 번 묻는다. 내 행(scanner_id = 나)에만 쓴다.
// first_meet null 은 건너뛰기다. 답한 시각은 남겨 다시 묻지 않는다. 한 줄 메모는 계산에 쓰지 않는다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { UUID } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({
  target_id: z.string().regex(UUID, "uuid 형식"),
  first_meet: z.boolean().nullable(),
  note: z.string().trim().max(100).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const guard = await collectGuard(s.pid);
    if (guard) return guard;

    const patch: Record<string, unknown> = { first_meet: b.first_meet, first_meet_at: new Date().toISOString() };
    if (b.note !== undefined) patch.note = b.note || null;
    const { data, error } = await db()
      .from("card_exchanges")
      .update(patch)
      .eq("scanner_id", s.pid)
      .eq("scanned_id", b.target_id.toLowerCase())
      .eq("status", "confirmed")
      .select("first_meet, first_meet_at, note")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("NOT_FOUND", "성립한 교환이 아니다", 404);
    await logEvent("card_first_meet", s.pid, { target_id: b.target_id, first_meet: b.first_meet, note: b.note !== undefined });
    return ok({ first_meet: data.first_meet, first_meet_at: data.first_meet_at, note: data.note });
  });
}
