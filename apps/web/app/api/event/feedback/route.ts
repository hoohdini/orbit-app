// GET /api/event/feedback   내가 남긴 행사 후기. 없으면 feedback: null
// POST /api/event/feedback { rating, tags, comment? }  행사 후기 제출(피그마 이벤트·미션, 미션 ④).
// rating = 1 별로였다 · 2 좋았다 · 3 최고였다. tags 는 고른 항목(여러 개, 없어도 됨), comment 는 100자까지.
// 한 사람당 한 건이다. 다시 내면 덮어쓰고 처음 낸 시각(created_at)은 그대로 둔다.
// 미션 마감(ops_state mission_closed_at) 뒤에 처음 낸 후기는 저장하되 스탬프로 세지 않는다(lib/missions.ts).
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";

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
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
    const b = Body.parse(await req.json());

    const { data: prev, error: prevErr } = await db().from("event_feedback").select("participant_id").eq("participant_id", s.pid).maybeSingle();
    if (prevErr) throw prevErr;

    const row = { rating: b.rating, tags: Array.from(new Set(b.tags)), comment: b.comment || null, updated_at: new Date().toISOString() };
    const { error } = prev
      ? await db().from("event_feedback").update(row).eq("participant_id", s.pid)
      : await db().from("event_feedback").insert({ participant_id: s.pid, ...row });
    if (error) throw error;

    await logEvent("event_feedback", s.pid, { rating: b.rating, tags: row.tags.length, again: !!prev });
    return ok({ saved: true });
  });
}
