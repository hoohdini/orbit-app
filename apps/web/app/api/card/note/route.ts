// POST /api/card/note { target_id, note }  명함 상세 화면의 메모 저장(10/11 피그마 명함 상세). 내 행(scanner_id = 나)에만 쓴다.
// 오늘 처음 대화한 분인가요? 의 답(first_meet)은 건드리지 않는다. 빈 문자열이면 메모를 지운다. 확인 대기(pending) 교환에도 쓸 수 있다.
// 메모는 계산에 쓰지 않는다. 200자(0013)
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
  note: z.string().trim().max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const guard = await collectGuard(s.pid);
    if (guard) return guard;

    const { data, error } = await db()
      .from("card_exchanges")
      .update({ note: b.note || null })
      .eq("scanner_id", s.pid)
      .eq("scanned_id", b.target_id.toLowerCase())
      .select("note")
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail("NOT_FOUND", "교환한 명함이 아니다", 404);
    await logEvent("card_note", s.pid, { target_id: b.target_id, length: b.note.length });
    return ok({ note: data.note });
  });
}
