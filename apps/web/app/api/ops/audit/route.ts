// GET /api/ops/audit?limit=  감사 로그(개발 지시서 v0.2 A-09). 단계 전환, 공개, 철회, 수동 교체, 공지 등 운영 쓰기를 행위자 · 시각과 함께 최신 순으로.
// 운영 쓰기 API 는 모두 event_log 에 운영자 id 를 participant_id 로 남긴다(lib/log.ts). 여기서는 그 줄만 모아 보여 준다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { eventParticipantIds } from "../_lib";

export const dynamic = "force-dynamic";

const AUDIT_KINDS = [
  "ops_phase", "ops_notice", "ops_publish", "ops_unpublish", "ops_swap", "ops_compute", "ops_checkin",
  "ops_label", "ops_raffle", "ops_award_exclude", "walkin_added", "pin_reset",
];

const Query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const { limit } = Query.parse({ limit: new URL(req.url).searchParams.get("limit") ?? undefined });
    const ids = await eventParticipantIds();
    const { data, error } = await db()
      .from("event_log")
      .select("id, kind, participant_id, payload, created_at")
      .in("kind", AUDIT_KINDS)
      .in("participant_id", ids)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const actors = Array.from(new Set((data ?? []).map((r) => r.participant_id as string)));
    const { data: people, error: pErr } = actors.length
      ? await db().from("participants").select("id, display_name").in("id", actors)
      : { data: [], error: null };
    if (pErr) throw pErr;
    const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.display_name as string]));
    return ok({
      entries: (data ?? []).map((r) => ({
        id: r.id,
        kind: r.kind,
        actor: { id: r.participant_id, display_name: nameOf.get(r.participant_id as string) ?? null },
        payload: r.payload,
        at: r.created_at,
      })),
    });
  });
}
