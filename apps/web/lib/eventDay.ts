// 행사 당일 단계를 처음 열 때 그날 전 기록을 치운다(10/30 민찬 결정: 당일 사람이 SQL 로 지울 일을 없앤다).
// 첫 로그인이 체크인이라 리허설 · 시험 로그인으로 생긴 체크인이 남으면 안 온 사람도 커피챗 자리를 받는다. 리허설에서 마무리까지 가면
// 미션 마감 시각이 그때로 고정돼 당일 스탬프가 모두 마감 뒤가 된다. 리허설 커피챗이 공개된 채 남으면 당일 들어온 사람이 그 배정에 앉는다.
// 그래서 단계를 행사 전이 아닌 단계(보통 '등록 · 개회')로 바꿀 때마다 오늘(한국 시각 0시) 전에 생긴 것만 지운다(건너뛰어도 정리되게). 오늘 생긴 것은 건드리지 않으므로
// 당일 실수로 단계를 되돌렸다 다시 열어도 그날 체크인은 그대로다.
//   checkins: 이 행사 참가자 중 checked_at 이 오늘 전인 행(지연 · 나감 표시도 같이). 늦참 예정 · 커피챗 불참 명단(ops_state)은 남는다
//   ops_state: mission_closed_at · award_draw · raffle_result 중 시각이 오늘 전인 것
//   assign_versions: 이 행사 커피챗 공개본 중 오늘 전에 공개된 것은 retired(테이블토크는 전날 계산을 그대로 쓰므로 두지 않음)
import "server-only";
import { db } from "./db";
import { eventId } from "./api";

const KST_MS = 9 * 60 * 60 * 1000;

// 한국 시각 오늘 0시(UTC ISO)
export function kstTodayStart(now = new Date()): string {
  const k = new Date(now.getTime() + KST_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST_MS).toISOString();
}

const STALE_KEYS = ["mission_closed_at", "award_draw", "raffle_result"];

export async function clearBeforeToday(): Promise<{ since: string; checkins: number; ops_keys: string[]; coffeechat_retired: number[] }> {
  const since = kstTodayStart();
  const { data: people, error: pErr } = await db().from("participants").select("id").eq("event_id", eventId());
  if (pErr) throw pErr;
  const ids = (people ?? []).map((p) => p.id as string);
  let checkins = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("checkins").delete().in("participant_id", ids.slice(i, i + 200)).lt("checked_at", since).select("participant_id");
    if (error) throw error;
    checkins += (data ?? []).length;
  }

  const { data: ops, error: oErr } = await db().from("ops_state").select("key, value").in("key", STALE_KEYS);
  if (oErr) throw oErr;
  const stale = (ops ?? [])
    .filter((r) => {
      const v = r.value as unknown;
      const at = typeof v === "string" ? v : typeof (v as { at?: unknown } | null)?.at === "string" ? (v as { at: string }).at : null;
      return at !== null && new Date(at).getTime() < new Date(since).getTime();
    })
    .map((r) => r.key as string);
  if (stale.length) {
    const { error } = await db().from("ops_state").delete().in("key", stale);
    if (error) throw error;
  }

  const { data: vs, error: vErr } = await db()
    .from("assign_versions")
    .update({ status: "retired" })
    .eq("event_id", eventId())
    .eq("round", "coffeechat")
    .eq("status", "published")
    .lt("published_at", since)
    .select("version");
  if (vErr) throw vErr;
  return { since, checkins, ops_keys: stale, coffeechat_retired: (vs ?? []).map((v) => v.version as number) };
}
