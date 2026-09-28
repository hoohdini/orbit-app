// 운영 콘솔 API 가 같이 쓰는 서버 전용 조회. 이 행사(EVENT_ID)의 참가자 id 목록과 그 목록으로 세는 도우미.
import "server-only";
import { db } from "@/lib/db";
import { eventId } from "@/lib/api";

export type Round = "tabletalk" | "coffeechat";
export const ROUNDS: Round[] = ["tabletalk", "coffeechat"];

export async function eventParticipantIds(): Promise<string[]> {
  const { data, error } = await db().from("participants").select("id").eq("event_id", eventId());
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

// table 에서 column 이 ids 에 드는 행 수. eq 를 주면 그 조건도 건다. in 조건은 200개씩 잘라 보낸다(URL 길이)
export async function countIn(table: string, column: string, ids: string[], eq?: [string, string]): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += 200) {
    let q = db().from(table).select(column, { count: "exact", head: true }).in(column, ids.slice(i, i + 200));
    if (eq) q = q.eq(eq[0], eq[1]);
    const { count, error } = await q;
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

export async function opsGet<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await db().from("ops_state").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
}

export async function opsSet(key: string, value: unknown): Promise<void> {
  const { error } = await db().from("ops_state").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}
