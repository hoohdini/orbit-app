// 미션 4종 · 스탬프 5칸 판정(피그마 이벤트·미션, 개발 지시서 v0.2 E-01 ~ E-06). 참가자 화면(이벤트 탭, 상태 띠)과 운영 콘솔(시상 집계)이 같이 쓴다.
// ① 포스터 관심도 2건(포스터 응답, 흥미 3단계 어떤 답이든)  ② 퀴즈 3개 맞히기(서로 다른 포스터)  ③ 명함 교환 5명(3명 · 5명에서 스탬프 한 칸씩)  ④ 행사 후기 남기기
// 스탬프는 ① 1칸 + ② 1칸 + ③ 최대 2칸 + ④ 1칸 = 5칸이다. done_count 는 찍힌 스탬프 수, total 은 5다.
// 교환은 성립한 것(status confirmed)만, 같은 상대는 한 번만 센다. 마감(ops_state mission_closed_at) 뒤의 기록은 세지 않는다.
// 후기는 커피챗이 끝난 뒤(wrapup · award)에 받고, 마감 시각(= 마무리로 넘긴 시각) 뒤에 낸 후기만 스탬프다(10/22 · 10/25 민찬 결정). 조기 퇴장한 사람은 그 전에도 후기를 낼 수 있지만 스탬프는 없다.
// 진행도 = 찍힌 스탬프 수 / 5(10/22 민찬 결정. 예전 네 미션 달성률 평균은 버렸다). 스탬프 3칸이면 0.6. 참가자 화면 · 운영 콘솔 · 시상이 같은 값을 본다.
// 시상 동점 처리 값(tiebreak, 10/23 민찬 결정, 순서는 lib/award.ts):
//   recommended_exchanges  추천 인물과의 교환 수(최대 5). 추천 인물 = 교환이 성립하기 전에 내 오늘 만나면 좋을 분 목록(rec_impressions first_shown_at)에 떴던 상대.
//                          성립한 교환만, 마감 전 것만, 같은 상대는 한 번. 예전 추천 인물 미션(c4fe6d2 전)과 같은 판정이다
//   valid_poster_responses 5초 이상 걸린 포스터 응답 수
import "server-only";
import { db } from "./db";

export const MISSIONS = [
  { key: "poster", label: "포스터 관심도", goal: 2, milestones: [2] },
  { key: "quiz", label: "퀴즈", goal: 3, milestones: [3] },
  { key: "exchange", label: "명함 교환", goal: 5, milestones: [3, 5] },
  { key: "feedback", label: "행사 후기", goal: 1, milestones: [1] },
] as const;
export type MissionKey = (typeof MISSIONS)[number]["key"];
export const STAMP_TOTAL = MISSIONS.reduce((n, m) => n + m.milestones.length, 0); // 5

export type MissionItem = {
  key: MissionKey;
  label: string;
  goal: number;
  count: number;
  done: boolean;
  completed_at: string | null;
  milestones: number[]; // 스탬프가 찍히는 달성 수. 명함 교환은 [3, 5]
  stamps: number; // 이 미션에서 찍힌 스탬프 수
};
export type MissionStatus = {
  missions: MissionItem[];
  done_count: number; // 찍힌 스탬프 수(0~5)
  total: number; // 스탬프 칸 수(5)
  progress: number; // 찍힌 스탬프 수 / 5(0~1, 소수 셋째 자리)
  completed_all_at: string | null; // 스탬프 5칸이 다 찍힌 시각
  // 시상 동점 처리용(A-07). 참가자 화면에는 내보내지 않는다
  tiebreak: { recommended_exchanges: number; valid_poster_responses: number };
};

const CHUNK = 200;
const MIN_LATENCY_MS = 5000; // 계산 서비스 B-05 와 같다. 5초 미만 응답은 유효 응답으로 세지 않는다(시상 동점 처리)
export const REC_EXCHANGE_CAP = 5; // 추천 인물 교환은 5명까지만 센다(10/23 민찬 결정)

const PAGE = 1000; // Supabase 기본 최대 행 수. 한 묶음(200명)의 행이 이보다 많으면(추천 노출 200명 × 10 = 2000행) range 로 끝까지 읽는다(lib/pairs.ts 와 같다)

// ids 를 200명씩 나눠 읽고, 묶음마다 PAGE 행씩 끝까지 읽는다. order = 행을 하나로 정하는 칸(페이지가 겹치거나 빠지지 않게)
async function rowsIn<T>(table: string, cols: string, column: string, ids: string[], order: string[], extra?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      let q = db().from(table).select(cols).in(column, ids.slice(i, i + CHUNK));
      if (extra) q = extra(q);
      for (const o of order) q = q.order(o);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

type Resp = { participant_id: string; poster_id: number; created_at: string; latency_ms: number | null };
type Att = { participant_id: string; poster_id: number; created_at: string };
type Ex = { scanner_id: string; scanned_id: string; confirmed_at: string | null };
type Fb = { participant_id: string; created_at: string };
type Imp = { participant_id: string; target_id: string; first_shown_at: string };

// k 번째(1부터)로 이른 시각. 모자라면 null
function kth(times: string[], k: number): string | null {
  if (times.length < k) return null;
  return [...times].sort()[k - 1];
}

// pids 의 미션 상태를 한 번에 계산한다. closedAt 이 있으면 그 뒤 기록은 뺀다
export async function missionStatuses(pids: string[], closedAt: string | null): Promise<Map<string, MissionStatus>> {
  const out = new Map<string, MissionStatus>();
  if (pids.length === 0) return out;
  const inTime = (t: string | null | undefined): t is string => !!t && (!closedAt || t <= closedAt);

  const [resps, atts, exs, fbs, imps] = await Promise.all([
    rowsIn<Resp>("poster_responses", "participant_id, poster_id, created_at, latency_ms", "participant_id", pids, ["participant_id", "poster_id"]),
    rowsIn<Att>("quiz_attempts", "participant_id, poster_id, created_at", "participant_id", pids, ["id"], (q) => q.eq("is_correct", true)),
    rowsIn<Ex>("card_exchanges", "scanner_id, scanned_id, confirmed_at", "scanner_id", pids, ["id"], (q) => q.eq("status", "confirmed")),
    rowsIn<Fb>("event_feedback", "participant_id, created_at", "participant_id", pids, ["participant_id"]),
    rowsIn<Imp>("rec_impressions", "participant_id, target_id, first_shown_at", "participant_id", pids, ["participant_id", "target_id"]),
  ]);

  const by = <T, K extends keyof T>(rows: T[], key: K) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = r[key] as unknown as string;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  };
  const respOf = by(resps, "participant_id");
  const attOf = by(atts, "participant_id");
  const exOf = by(exs, "scanner_id");
  const fbOf = by(fbs, "participant_id");
  const impOf = by(imps, "participant_id");

  for (const pid of pids) {
    const myResp = (respOf.get(pid) ?? []).filter((r) => inTime(r.created_at));
    const myEx = (exOf.get(pid) ?? []).filter((e) => inTime(e.confirmed_at));

    const posterTimes = myResp.map((r) => r.created_at);
    // 퀴즈: 포스터마다 처음 맞힌 시각
    const firstCorrect = new Map<number, string>();
    for (const a of attOf.get(pid) ?? []) if (inTime(a.created_at) && (!firstCorrect.has(a.poster_id) || a.created_at < firstCorrect.get(a.poster_id)!)) firstCorrect.set(a.poster_id, a.created_at);
    const quizTimes = [...firstCorrect.values()];
    // 명함 교환: 상대마다 처음 성립한 시각
    const firstExchange = new Map<string, string>();
    for (const e of myEx) if (!firstExchange.has(e.scanned_id) || e.confirmed_at! < firstExchange.get(e.scanned_id)!) firstExchange.set(e.scanned_id, e.confirmed_at!);
    const exchangeTimes = [...firstExchange.values()];
    // 추천 인물 교환: 성립 시각 전에 내 추천 목록에 떴던 상대(서로 다른 사람)
    const shownAt = new Map((impOf.get(pid) ?? []).map((i) => [i.target_id, i.first_shown_at]));
    const recPartners = new Set(myEx.filter((e) => shownAt.has(e.scanned_id) && shownAt.get(e.scanned_id)! <= e.confirmed_at!).map((e) => e.scanned_id));
    // 후기 스탬프는 마무리(= 마감 시각) 뒤에 낸 후기만. 그 전에 낸 후기는 조기 퇴장한 사람 것이라 스탬프를 주지 않는다(10/25 민찬 결정: 시상 때 없으니 의미 없음)
    const feedbackTimes = (fbOf.get(pid) ?? []).map((f) => f.created_at).filter((t) => !!closedAt && t >= closedAt);

    const timesOf: Record<MissionKey, string[]> = { poster: posterTimes, quiz: quizTimes, exchange: exchangeTimes, feedback: feedbackTimes };
    const stampTimes: string[] = [];
    const missions: MissionItem[] = MISSIONS.map((m) => {
      const t = timesOf[m.key];
      const at = kth(t, m.goal);
      const reached = m.milestones.map((k) => kth(t, k)).filter((x): x is string => x !== null);
      stampTimes.push(...reached);
      return { key: m.key, label: m.label, goal: m.goal, count: Math.min(t.length, m.goal), done: at !== null, completed_at: at, milestones: [...m.milestones], stamps: reached.length };
    });
    out.set(pid, {
      missions,
      done_count: stampTimes.length,
      total: STAMP_TOTAL,
      progress: Math.round((stampTimes.length / STAMP_TOTAL) * 1000) / 1000,
      completed_all_at: stampTimes.length === STAMP_TOTAL ? [...stampTimes].sort().at(-1)! : null,
      tiebreak: {
        recommended_exchanges: Math.min(recPartners.size, REC_EXCHANGE_CAP),
        valid_poster_responses: myResp.filter((r) => (r.latency_ms ?? 0) >= MIN_LATENCY_MS).length,
      },
    });
  }
  return out;
}

export async function missionStatus(pid: string, closedAt: string | null): Promise<MissionStatus> {
  return (await missionStatuses([pid], closedAt)).get(pid)!;
}

// 참가자 화면용. 시상 동점 처리 값은 뺀다
export function publicMission(m: MissionStatus) {
  const { tiebreak: _t, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

// 이 행사 운영자 화면 등에서 쓰는 참가자 id 목록(체크인한 사람)
export async function checkedInIds(eventId: string): Promise<string[]> {
  const { data, error } = await db().from("participants").select("id, checkins!checkins_participant_id_fkey!inner(participant_id)").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}
