// 미션 4종 판정(개발 지시서 v0.2 E-01 ~ E-06, 결정 11 · 12). 참가자 화면(이벤트 탭, 상태 띠)과 운영 콘솔(시상 집계)이 같이 쓴다.
// ① 관심 포스터 2건  ② 오늘 만나면 좋을 분에 떴던 사람 1명과 교환  ③ 첫 대화로 체크한 교환 2건  ④ 구분이 다른 사람 1명과 교환
// 교환은 성립한 것(status confirmed)만 센다. 마감(ops_state mission_closed_at) 뒤의 기록은 세지 않는다.
// 진행도 = 네 미션의 min(달성 수 / 목표 수, 1) 평균. 포스터 1/2 이면 0.5.
import "server-only";
import { db } from "./db";

export const MISSIONS = [
  { key: "poster", label: "관심 포스터 발견하기", goal: 2 },
  { key: "recommended", label: "추천 인물 만나기", goal: 1 },
  { key: "first_meet", label: "새로운 연결", goal: 2 },
  { key: "generation", label: "세대 연결", goal: 1 },
] as const;
export type MissionKey = (typeof MISSIONS)[number]["key"];

export type MissionItem = { key: MissionKey; label: string; goal: number; count: number; done: boolean; completed_at: string | null };
export type MissionStatus = {
  missions: MissionItem[];
  done_count: number;
  total: number;
  progress: number; // 0~1, 소수 셋째 자리
  completed_all_at: string | null;
  // 시상 동점 처리용(A-07). 참가자 화면에는 내보내지 않는다
  tiebreak: { valid_poster_responses: number; first_meet_exchanges: number };
};

const CHUNK = 200;
const MIN_LATENCY_MS = 5000; // 계산 서비스 B-05 와 같다. 5초 미만 응답은 유효 응답으로 세지 않는다(시상 동점 처리)

async function rowsIn<T>(table: string, cols: string, column: string, ids: string[], extra?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    let q = db().from(table).select(cols).in(column, ids.slice(i, i + CHUNK));
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

// 세대 연결의 구분. 재학생과 그 밖(졸업생 · 교수 · 외부)으로 나눈다. 운영진도 사전 등록 구분 그대로 센다
export function generationOf(role: string | null | undefined): "student" | "other" {
  return role === "student" ? "student" : "other";
}

type Resp = { participant_id: string; poster_id: number; created_at: string; latency_ms: number | null };
type Ex = { scanner_id: string; scanned_id: string; confirmed_at: string | null; first_meet: boolean | null; first_meet_at: string | null };
type Imp = { participant_id: string; target_id: string; first_shown_at: string };

const later = (a: string, b: string | null) => (b && b > a ? b : a);

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

  const [resps, exs, imps] = await Promise.all([
    rowsIn<Resp>("poster_responses", "participant_id, poster_id, created_at, latency_ms", "participant_id", pids),
    rowsIn<Ex>("card_exchanges", "scanner_id, scanned_id, confirmed_at, first_meet, first_meet_at", "scanner_id", pids, (q) => q.eq("status", "confirmed")),
    rowsIn<Imp>("rec_impressions", "participant_id, target_id, first_shown_at", "participant_id", pids),
  ]);

  const roleIds = Array.from(new Set([...pids, ...exs.map((e) => e.scanned_id)]));
  const roles = await rowsIn<{ id: string; role: string }>("participants", "id, role", "id", roleIds);
  const roleOf = new Map(roles.map((r) => [r.id, r.role]));

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
  const exOf = by(exs, "scanner_id");
  const impOf = by(imps, "participant_id");

  for (const pid of pids) {
    const myResp = (respOf.get(pid) ?? []).filter((r) => inTime(r.created_at));
    const myEx = (exOf.get(pid) ?? []).filter((e) => inTime(e.confirmed_at));
    const shownAt = new Map((impOf.get(pid) ?? []).map((i) => [i.target_id, i.first_shown_at]));

    const posterTimes = myResp.map((r) => r.created_at);
    const recTimes = myEx.filter((e) => {
      const s = shownAt.get(e.scanned_id);
      return !!s && s <= e.confirmed_at!;
    }).map((e) => e.confirmed_at!);
    const firstMeetTimes = myEx
      .filter((e) => e.first_meet === true)
      .map((e) => later(e.confirmed_at!, e.first_meet_at))
      .filter((t) => inTime(t));
    const myGen = generationOf(roleOf.get(pid));
    const genTimes = myEx.filter((e) => roleOf.has(e.scanned_id) && generationOf(roleOf.get(e.scanned_id)) !== myGen).map((e) => e.confirmed_at!);

    const timesOf: Record<MissionKey, string[]> = { poster: posterTimes, recommended: recTimes, first_meet: firstMeetTimes, generation: genTimes };
    const missions: MissionItem[] = MISSIONS.map((m) => {
      const t = timesOf[m.key];
      const at = kth(t, m.goal);
      return { key: m.key, label: m.label, goal: m.goal, count: Math.min(t.length, m.goal), done: at !== null, completed_at: at };
    });
    const done = missions.filter((m) => m.done);
    const progress = missions.reduce((s, m) => s + Math.min(m.count / m.goal, 1), 0) / missions.length;
    out.set(pid, {
      missions,
      done_count: done.length,
      total: missions.length,
      progress: Math.round(progress * 1000) / 1000,
      completed_all_at: done.length === missions.length ? done.map((m) => m.completed_at!).sort().at(-1)! : null,
      tiebreak: {
        valid_poster_responses: myResp.filter((r) => (r.latency_ms ?? 0) >= MIN_LATENCY_MS).length,
        first_meet_exchanges: firstMeetTimes.length,
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
