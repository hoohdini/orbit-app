// POST /api/tabletalk/satisfaction { choice, comment?, round? }  라운드가 끝날 때 만족도 1문항. 선택지는 _choices.ts
// GET  /api/tabletalk/satisfaction?round=tabletalk|coffeechat  내가 이미 답했는지(전면 카드를 다시 띄우지 않으려고)
// 개발 지시서 v0.2 N-03: 테이블토크 뒤 · 커피챗 뒤 두 번 묻는다. round 를 안 보내면 tabletalk.
// '잘 모르겠다'(unsure)는 답으로 저장하고, 답하지 않은 사람은 행이 없다(무응답 = 중립, 계산에 반영하지 않음).
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { SATISFACTION_KEYS } from "../_choices";

export const dynamic = "force-dynamic";

const Round = z.enum(["tabletalk", "coffeechat"]);

const Body = z.object({
  choice: z.enum(SATISFACTION_KEYS),
  comment: z.string().trim().max(300).optional(),
  round: Round.default("tabletalk"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
    const b = Body.parse(await req.json());

    const { error } = await db()
      .from("satisfaction")
      .upsert(
        { participant_id: s.pid, round: b.round, choice: b.choice, comment: b.comment ?? null },
        { onConflict: "participant_id,round" }
      );
    if (error) throw error;

    await logEvent(`${b.round}_satisfaction`, s.pid, { choice: b.choice });
    return ok({ saved: true, round: b.round });
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const round = Round.parse(new URL(req.url).searchParams.get("round") ?? "tabletalk");
    const { data, error } = await db()
      .from("satisfaction")
      .select("choice")
      .eq("participant_id", s.pid)
      .eq("round", round)
      .maybeSingle();
    if (error) throw error;
    return ok({ round, answered: !!data, choice: (data?.choice as string | undefined) ?? null });
  });
}
