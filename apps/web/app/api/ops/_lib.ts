// 운영 콘솔 API 가 같이 쓰는 서버 전용 조회. 이 행사(EVENT_ID)의 참가자 id 목록과 그 목록으로 세는 · 읽는 도우미.
import "server-only";
import { db } from "@/lib/db";
import { eventId } from "@/lib/api";

export type Round = "tabletalk" | "coffeechat";
export const ROUNDS: Round[] = ["tabletalk", "coffeechat"];
const CHUNK = 200; // in 조건은 200개씩 잘라 보낸다(URL 길이). 참가자 100명 안팎이라 보통 한 번에 끝난다

export async function eventParticipantIds(): Promise<string[]> {
  const { data, error } = await db().from("participants").select("id").eq("event_id", eventId());
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

// table 에서 column 이 ids 에 드는 행 수. eq 를 주면 그 조건도 건다
export async function countIn(table: string, column: string, ids: string[], eq?: [string, string]): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    let q = db().from(table).select(column, { count: "exact", head: true }).in(column, ids.slice(i, i + CHUNK));
    if (eq) q = q.eq(eq[0], eq[1]);
    const { count, error } = await q;
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

// table 에서 column 이 ids 에 드는 행을 전부 읽는다
export async function selectIn<T = Record<string, unknown>>(table: string, cols: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db().from(table).select(cols).in(column, ids.slice(i, i + CHUNK));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
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

// 이 행사의 참가자인지 확인한다. 아니면 null
export async function eventParticipant(id: string) {
  const { data, error } = await db().from("participants").select("id, display_name, affiliation").eq("id", id).eq("event_id", eventId()).maybeSingle();
  if (error) throw error;
  return data;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RaffleResult = { at: string; n: number; winners: { id: string; display_name: string; affiliation: string | null; tickets: number }[] };
