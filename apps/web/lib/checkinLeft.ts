// 일찍 나감(checkins.left_at · left_by, 0019 · 10/25 민찬 결정)을 읽는 서버 전용 도우미.
// 0019 가 아직 DB 에 없어도 상태 API · 콘솔 · 늦게 온 사람 자리가 멈추지 않게, 칸이 없다는 오류면 아무도 나가지 않은 것으로 본다
// (계산 서비스 repo.left_checkins 와 같다. 10/25 민찬 요청). 나감 표시 API 만 legacy 를 보고 503 으로 알린다.
import "server-only";
import { db } from "./db";

const CHUNK = 200; // in 조건은 200개씩(URL 길이)

// 42703 = 없는 칸(select · filter), PGRST204 = 스키마 캐시에 없는 칸(update). 다른 칸 오류까지 덮지 않게 left_ 칸 이름도 본다
export function noLeftColumn(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === "42703" || e.code === "PGRST204") && /left_(at|by)/.test(e.message ?? "");
}

export type MyCheckin = { checked_in: boolean; left_at: string | null; legacy: boolean };

// 한 사람의 체크인 여부와 나감 시각. legacy = 0019 전 DB(left_at 은 늘 null)
export async function myCheckin(pid: string): Promise<MyCheckin> {
  const { data, error } = await db().from("checkins").select("left_at").eq("participant_id", pid).maybeSingle();
  if (!error) return { checked_in: !!data, left_at: (data?.left_at as string | null | undefined) ?? null, legacy: false };
  if (!noLeftColumn(error)) throw error;
  const { data: d2, error: e2 } = await db().from("checkins").select("participant_id").eq("participant_id", pid).maybeSingle();
  if (e2) throw e2;
  return { checked_in: !!d2, left_at: null, legacy: true };
}

// ids 중 나감 표시한 사람 → {left_at, left_by}. 0019 전 DB 면 빈 Map
export async function leftOf(ids: string[]): Promise<Map<string, { left_at: string; left_by: string | null }>> {
  const out = new Map<string, { left_at: string; left_by: string | null }>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db()
      .from("checkins")
      .select("participant_id, left_at, left_by")
      .in("participant_id", ids.slice(i, i + CHUNK))
      .not("left_at", "is", null);
    if (error) {
      if (noLeftColumn(error)) return new Map();
      throw error;
    }
    for (const r of data ?? []) out.set(r.participant_id as string, { left_at: r.left_at as string, left_by: (r.left_by as string | null) ?? null });
  }
  return out;
}
