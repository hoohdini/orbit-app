// POST /api/tabletalk/satisfaction { choice, picks?, elapsed_ms?, comment?, round? }  라운드가 끝날 때 만족도 3지선다 + 사람 고르기. 선택지는 _choices.ts
// GET  /api/tabletalk/satisfaction?round=tabletalk|coffeechat  내가 이미 답했는지(전면 카드를 다시 띄우지 않으려고)
// 개발 지시서 v0.2 N-03: 테이블토크 뒤 · 커피챗 뒤 두 번 묻는다. round 를 안 보내면 tabletalk.
// picks = 같은 테이블(커피챗은 같은 그룹)에서 '이런 분을 더 만나 보고 싶다' 싶었던 사람(선택, 여러 명). 고른 사람에게는 알리지 않는다.
//   그 라운드 최신 공개 배정에서 나와 같은 테이블인 사람만 받는다. 본인 · 중복은 빼고 저장한다
// elapsed_ms = 화면에 질문이 뜬 뒤 제출까지 걸린 시간(화면이 잰다). 계산 서비스가 1초 미만 답을 뺀다
// 다시 내면 덮어쓴다. picks · elapsed_ms 는 보낸 경우에만 덮어쓴다(답만 바꿀 때 지워지지 않게)
// 답하지 않은 사람은 행이 없다(무응답 = 중립, 계산에 반영하지 않음).
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { collectGuard } from "@/lib/consent";
import { SATISFACTION_KEYS, PICKS_MAX } from "../_choices";

export const dynamic = "force-dynamic";

const Round = z.enum(["tabletalk", "coffeechat"]);

const Body = z.object({
  choice: z.enum(SATISFACTION_KEYS),
  picks: z.array(z.string().uuid()).max(PICKS_MAX).optional(), // 안 보내면 이전에 고른 사람을 그대로 둔다
  elapsed_ms: z.number().int().min(0).max(3_600_000).optional(),
  comment: z.string().trim().max(300).optional(),
  round: Round.default("tabletalk"),
});

// 그 라운드 최신 공개 배정에서 나와 같은 테이블인 사람 id
async function tablemates(pid: string, round: "tabletalk" | "coffeechat"): Promise<Set<string> | null> {
  const { data: mine, error } = await db()
    .from("current_tables")
    .select("version, table_no")
    .eq("round", round)
    .eq("participant_id", pid)
    .maybeSingle();
  if (error) throw error;
  if (!mine) return null;
  const { data, error: e2 } = await db()
    .from("current_tables")
    .select("participant_id")
    .eq("round", round)
    .eq("version", mine.version)
    .eq("table_no", mine.table_no);
  if (e2) throw e2;
  return new Set((data ?? []).map((r) => r.participant_id as string).filter((id) => id !== pid));
}

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const guard = await collectGuard(s.pid); // 동의 거부자는 행사 중 수집 제외(10/5 회의)
    if (guard) return guard;
    const b = Body.parse(await req.json());

    const picks = b.picks === undefined ? undefined : [...new Set(b.picks)].filter((id) => id !== s.pid);
    if (picks && picks.length > 0) {
      const mates = await tablemates(s.pid, b.round);
      if (!mates) return fail("NOT_SEATED", "이 라운드에 배정된 테이블이 없다", 409);
      if (picks.some((id) => !mates.has(id))) return fail("BAD_INPUT", "같은 테이블 사람만 고를 수 있다", 400);
    }

    const { error } = await db()
      .from("satisfaction")
      .upsert(
        {
          participant_id: s.pid,
          round: b.round,
          choice: b.choice,
          comment: b.comment ?? null,
          // 보낸 칸만 덮어쓴다(답만 바꿀 때 고른 사람 · 걸린 시간이 지워지지 않게). 처음 낼 때 안 보내면 빈 배열 · null
          ...(picks !== undefined ? { picks } : {}),
          ...(b.elapsed_ms !== undefined ? { elapsed_ms: b.elapsed_ms } : {}),
        },
        { onConflict: "participant_id,round" }
      );
    if (error) throw error;

    await logEvent(`${b.round}_satisfaction`, s.pid, { choice: b.choice, picks: picks?.length ?? null });
    return ok({ saved: true, round: b.round });
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const round = Round.parse(new URL(req.url).searchParams.get("round") ?? "tabletalk");
    const { data, error } = await db()
      .from("satisfaction")
      .select("choice, picks")
      .eq("participant_id", s.pid)
      .eq("round", round)
      .maybeSingle();
    if (error) throw error;
    return ok({
      round,
      answered: !!data,
      choice: (data?.choice as string | undefined) ?? null,
      picks: (data?.picks as string[] | undefined) ?? [],
    });
  });
}
