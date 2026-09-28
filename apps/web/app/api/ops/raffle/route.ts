// POST /api/ops/raffle { n }  응모권으로 추첨한다 (운영자 전용). 응모권 1장 = 1표, 한 사람은 한 번만 뽑힌다.
// 결과는 ops_state raffle_result 에 남겨 다시 열어도 보인다. 다시 뽑으면 덮어쓴다(event_log 에는 전부 남는다)
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { eventParticipantIds, selectIn, opsSet, type RaffleResult } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ n: z.number().int().min(1).max(50) });

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { n } = Body.parse(await req.json());
    const ids = await eventParticipantIds();
    const tickets = await selectIn<{ participant_id: string }>("raffle_tickets", "participant_id", "participant_id", ids);
    if (tickets.length === 0) return fail("NO_TICKETS", "응모권이 아직 없다", 409);

    const perPerson = new Map<string, number>();
    for (const t of tickets) perPerson.set(t.participant_id, (perPerson.get(t.participant_id) ?? 0) + 1);

    // 응모권 수만큼 표를 만들어 무작위로 뽑고, 이미 뽑힌 사람은 건너뛴다
    const pool = [...perPerson.entries()].flatMap(([id, c]) => Array(c).fill(id) as string[]);
    const winners: string[] = [];
    while (winners.length < n && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      const pick = pool[i];
      if (!winners.includes(pick)) winners.push(pick);
      for (let j = pool.length - 1; j >= 0; j--) if (pool[j] === pick) pool.splice(j, 1);
    }

    const { data: people, error } = await db().from("participants").select("id, display_name, affiliation").in("id", winners);
    if (error) throw error;
    const who = new Map((people ?? []).map((p) => [p.id as string, p]));
    const result: RaffleResult = {
      at: new Date().toISOString(),
      n,
      winners: winners.map((id) => ({
        id,
        display_name: (who.get(id)?.display_name as string) ?? "",
        affiliation: (who.get(id)?.affiliation as string | null) ?? null,
        tickets: perPerson.get(id) ?? 0,
      })),
    };
    await opsSet("raffle_result", result);
    await logEvent("ops_raffle", admin.pid, { n, winners });
    return ok(result);
  });
}
