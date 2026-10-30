// 행사 당일 단계를 처음 열 때 그날 전 기록을 치운다(10/30 민찬 결정: 당일 사람이 SQL 로 지울 일을 없앤다).
// 첫 로그인이 체크인이라 리허설 · 시험 로그인으로 생긴 체크인이 남으면 안 온 사람도 커피챗 자리를 받는다. 리허설에서 마무리까지 가면
// 미션 마감 시각이 그때로 고정돼 당일 스탬프가 모두 마감 뒤가 된다. 리허설 커피챗이 공개된 채 남으면 당일 들어온 사람이 그 배정에 앉는다.
// 그래서 행사 날(EVENT_DATE, 기본 2026-10-31 한국 시각)에 단계를 행사 전이 아닌 단계(보통 '등록 · 개회')로 바꿀 때마다 오늘 0시 전에 생긴 것만 지운다
// (건너뛰어도 정리되게). 오늘 생긴 것은 건드리지 않으므로 당일 실수로 단계를 되돌렸다 다시 열어도 그날 체크인은 그대로다.
// 행사 날이 아니면 지우지 않는다(행사 뒤 다른 날 단계를 바꿔도 행사 기록이 남게. 코드리뷰 10/30).
//   checkins: 이 행사 참가자 중 checked_at 이 오늘 전인 행(지연 · 나감 표시도 같이). 늦참 예정 · 커피챗 불참 명단(ops_state)은 남는다
//   ops_state: mission_closed_at · award_draw · raffle_result 중 시각이 오늘 전인 것
//   assign_versions: 이 행사 커피챗 공개본 중 오늘 전에 공개된 것은 retired(테이블토크는 전날 계산을 그대로 쓰므로 두지 않음)
import "server-only";
import { db } from "./db";
import { eventId } from "./api";
import { readOps } from "./opsState";

const KST_MS = 9 * 60 * 60 * 1000;

// 한국 시각 오늘 0시(UTC ISO)
export function kstTodayStart(now = new Date()): string {
  const k = new Date(now.getTime() + KST_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST_MS).toISOString();
}

// 행사 날(한국 시각 YYYY-MM-DD). Vercel 환경변수 EVENT_DATE 로 바꿀 수 있다
export function isEventDay(now = new Date()): boolean {
  const day = (process.env.EVENT_DATE ?? "2026-10-31").trim();
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10) === day;
}

// 체크인을 받는 때: 단계가 행사 전이 아니고, 그 단계를 오늘(한국 시각) 바꿨을 때(10/30 민찬 결정 · 코드리뷰).
// 리허설이 행사 전이 아닌 단계로 끝나 그대로 남아도, 다음 날 운영진이 단계를 바꾸기 전에는 앱을 연 사람이 체크인되지 않는다
export function checkinOpenAt(phase: unknown, phaseAt: string | null | undefined, now = new Date()): boolean {
  return typeof phase === "string" && phase !== "before" && !!phaseAt && new Date(phaseAt).getTime() >= new Date(kstTodayStart(now)).getTime();
}
export async function checkinOpen(): Promise<boolean> {
  const v = await readOps(["phase", "phase_meta"]);
  return checkinOpenAt(v.phase, (v.phase_meta as { at?: string } | null)?.at);
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
