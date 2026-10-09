// POST /api/poster/response { poster_id, reason, shown_order }  포스터 응답 제출(개발 지시서 v0.2 E-02, 미션 ①).
// reason = 흥미 3단계(want · maybe · not_mine, 0011). 어떤 답이든 스탬프를 준다
// 최근 15분 안에 그 포스터를 스캔해야 한다. 같은 포스터 재응답은 덮어쓰고 수를 올리지 않는다(순번 seq_no 도 그대로).
// 함께 저장: 보여 준 선택지 순서, 마지막 스캔부터 제출까지 걸린 시간(서버 시각), 몇 번째 포스터 응답인지, 퀴즈를 풀어 봤는지.
// 제출하면 그 포스터 스탬프를 찍는다(미션 ① 진행 = 스탬프 수). 응모권은 주지 않는다(v0.2 결정 6: 응모권은 명찰 번호로 앱 밖).
// 계산 서비스는 이 응답을 B-05 전처리(가중 · 필터) 뒤 커피챗에 반영한다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { REASON_KEYS, POSTER_MISSION_GOAL, SCAN_WINDOW_MIN } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({
  poster_id: z.number().int().positive(),
  reason: z.enum(REASON_KEYS),
  shown_order: z.array(z.enum(REASON_KEYS)).max(REASON_KEYS.length).default([]),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
    const b = Body.parse(await req.json());

    const since = new Date(Date.now() - SCAN_WINDOW_MIN * 60_000).toISOString();
    const { data: scan, error: scanErr } = await db()
      .from("event_log")
      .select("created_at")
      .eq("kind", "poster_scan")
      .eq("participant_id", s.pid)
      .eq("payload->>poster_id", String(b.poster_id))
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (scanErr) throw scanErr;
    if (!scan) return fail("SCAN_REQUIRED", `최근 ${SCAN_WINDOW_MIN}분 안에 이 포스터를 스캔해야 한다`, 403);
    const latency = Math.max(0, Date.now() - new Date(scan.created_at as string).getTime());

    const [prevRes, mineRes, quizRes] = await Promise.all([
      db().from("poster_responses").select("seq_no").eq("participant_id", s.pid).eq("poster_id", b.poster_id).maybeSingle(),
      db().from("poster_responses").select("poster_id", { count: "exact", head: true }).eq("participant_id", s.pid),
      db().from("quiz_attempts").select("id", { count: "exact", head: true }).eq("participant_id", s.pid).eq("poster_id", b.poster_id),
    ]);
    if (prevRes.error) throw prevRes.error;
    if (mineRes.error) throw mineRes.error;
    if (quizRes.error) throw quizRes.error;
    const seq = (prevRes.data?.seq_no as number | undefined) ?? (mineRes.count ?? 0) + 1;

    const { error } = await db()
      .from("poster_responses")
      .upsert(
        {
          participant_id: s.pid,
          poster_id: b.poster_id,
          reason: b.reason,
          shown_order: b.shown_order,
          latency_ms: latency,
          seq_no: seq,
          quiz_attempted: (quizRes.count ?? 0) > 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "participant_id,poster_id" }
      );
    if (error) throw error;

    const { error: stampErr } = await db()
      .from("stamps")
      .upsert({ participant_id: s.pid, poster_id: b.poster_id }, { onConflict: "participant_id,poster_id", ignoreDuplicates: true });
    if (stampErr) throw stampErr;

    const { count, error: cntErr } = await db()
      .from("poster_responses")
      .select("poster_id", { count: "exact", head: true })
      .eq("participant_id", s.pid);
    if (cntErr) throw cntErr;

    await logEvent("poster_response", s.pid, { poster_id: b.poster_id, reason: b.reason, seq_no: seq, again: !!prevRes.data });
    return ok({ saved: true, count: count ?? 0, goal: POSTER_MISSION_GOAL, done: (count ?? 0) >= POSTER_MISSION_GOAL });
  });
}
