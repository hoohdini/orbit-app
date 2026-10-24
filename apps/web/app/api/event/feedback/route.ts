// GET /api/event/feedback   내가 남긴 행사 후기. 없으면 feedback: null
// POST /api/event/feedback { rating, tags, comment? }  행사 후기 제출(피그마 이벤트·미션, 미션 ④).
// rating = 1 별로였다 · 2 좋았다 · 3 최고였다. tags 는 고른 항목(여러 개, 없어도 됨), comment 는 100자까지.
// 커피챗이 끝난 뒤(wrapup · award)에만 받는다. 그 전은 409 FEEDBACK_NOT_OPEN(10/22 민찬 결정). 미션 마감(wrapup)과 같은 때 열리므로 마감으로 스탬프를 자르지 않는다(lib/missions.ts).
// 한 사람당 한 건이다. 다시 내면 덮어쓰고 처음 낸 시각(created_at)은 그대로 둔다. 스탬프 1칸.
// 동의 거부자의 후기는 받지 않는다. 다른 수집 쓰기와 같이 403 CONSENT_REFUSED(아직 고르지 않았으면 CONSENT_REQUIRED)(10/23 민찬 결정, 10/22 의 익명 저장은 없앴다).
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { opsSnapshot } from "@/lib/opsState";
import { feedbackOpen } from "@/lib/phase";

export const dynamic = "force-dynamic";

// 화면 목록은 (modules)/event/feedback/choices.ts. 모듈은 import 하지 않으므로 키만 여기에 둔다
const TAG_KEYS = ["card_exchange", "recommended", "mission_stamp", "qr_scan", "layout", "speed", "notification"] as const;

const Body = z.object({
  rating: z.number().int().min(1).max(3),
  tags: z.array(z.enum(TAG_KEYS)).max(TAG_KEYS.length).default([]),
  comment: z.string().trim().max(100).optional(),
});

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const { data, error } = await db().from("event_feedback").select("rating, tags, comment").eq("participant_id", s.pid).maybeSingle();
    if (error) throw error;
    return ok({ feedback: data ? { rating: data.rating as number, tags: (data.tags as string[]) ?? [], comment: (data.comment as string | null) ?? "" } : null });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의). 후기도 같다(10/23 민찬 결정)
    if (guard) return guard;
    const b = Body.parse(await req.json());
    const ops = await opsSnapshot();
    if (!feedbackOpen(ops.phase)) return fail("FEEDBACK_NOT_OPEN", "커피챗이 끝난 뒤 남길 수 있다", 409);

    const row = { rating: b.rating, tags: Array.from(new Set(b.tags)), comment: b.comment || null };

    // 한 번에 넣거나 덮어쓴다(먼저 읽고 넣으면 두 번 눌렀을 때 PK 충돌이 났다). created_at 은 보내지 않아 처음 낸 시각이 남는다
    const { error } = await db()
      .from("event_feedback")
      .upsert({ participant_id: s.pid, ...row, updated_at: new Date().toISOString() }, { onConflict: "participant_id" });
    if (error) throw error;

    await logEvent("event_feedback", s.pid, { rating: b.rating, tags: row.tags.length });
    return ok({ saved: true });
  });
}
