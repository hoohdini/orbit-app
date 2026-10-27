// 커피챗 배정이 공개된 뒤 처음 체크인한 사람(늦게 온 사람)에게 커피챗 자리를 바로 준다(10/25 민찬 결정).
// 부르는 곳: 첫 로그인(ensureCheckin, 체크인이 이번에 새로 생겼을 때만), 운영자 수동 체크인(/api/ops/checkin), 워크인 추가(/api/ops/add-participant),
//   상태(/api/state, 커피챗 계산 뒤 · 공개 전에 들어와 자리가 없는 사람도 다음 폴링에서 앉힌다. 구현하며 정함 · 10/25 민찬 확정).
// 자리 고르기는 계산 서비스 POST /coffeechat/late(행사 전 정보로 잘 맞는 테이블, 인원 균형 · 같은 기수 상한). 2.5초 안에 답이 없거나 오류면
//   인원이 가장 적은 테이블(같으면 번호가 작은 쪽)로 앉힌다. 좌석은 그 테이블의 다음 번호라 앉아 있는 사람 번호는 그대로다. 주도 선배로 두지 않는다.
// 쓰는 곳은 공개된 커피챗 버전의 table_members(화면 current_tables 가 그대로 읽음). (version, participant_id) 기본 키로 두 번 들어가지 않는다.
// 건너뜀: 공개된 커피챗이 없을 때, 행사 직후 추천(params.kind final)이 공개됐을 때, 단계가 마무리 · 시상(wrapup · award)일 때(커피챗이 끝남. 구현하며 정함),
//   본인이 일찍 나간다고 표시했을 때(checkins.left_at, 0019 · 10/25 민찬 결정. 계산 서비스를 기다린 뒤에도 한 번 더 본다),
//   커피챗 불참으로 정해 둔 사람일 때(ops_state coffeechat_skip, 10/27 민찬 결정).
// 인원을 셀 때 나감 표시한 사람은 빼고 센다(그 자리는 비어 있다). 좌석 번호는 그 사람 번호도 포함해 다음 번호(구현하며 정함).
// 어떤 오류도 밖으로 던지지 않는다(로그인 · 체크인이 이것 때문에 실패하면 안 된다).
import "server-only";
import { db } from "./db";
import { eventId } from "./api";
import { logEvent } from "./log";
import { readOps, COFFEECHAT_SKIP_KEY, coffeechatSkip } from "./opsState";
import { MISSION_CLOSED, isPhase } from "./phase";
import { myCheckin, leftOf } from "./checkinLeft";

const TIMEOUT_MS = 2_500;
const FALLBACK_TEXT = "늦게 와서 배정(계산 서비스 응답 없음 · 인원이 가장 적은 테이블)";

export type LateSeat = { version: number; table_no: number; seat_no: number; fallback: boolean };

type Pick = { table_no: number; reason: Record<string, unknown> };

// 계산 서비스에 자리를 묻는다. 못 받으면 null(이유는 status 로)
async function askCompute(pid: string, version: number): Promise<{ pick: Pick | null; status: number }> {
  const base = (process.env.COMPUTE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return { pick: null, status: 0 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + "/coffeechat/late", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compute-Secret": process.env.COMPUTE_SECRET ?? "" },
      body: JSON.stringify({ event_id: eventId(), participant_id: pid, version }),
      signal: ctl.signal,
      cache: "no-store",
    });
    if (res.status !== 200) return { pick: null, status: res.status };
    const b = (await res.json()) as { version?: number; table_no?: number; reason?: Record<string, unknown> };
    if (b.version !== version || typeof b.table_no !== "number") return { pick: null, status: res.status };
    return { pick: { table_no: b.table_no, reason: b.reason ?? {} }, status: 200 };
  } catch {
    return { pick: null, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function seatLateCoffeechat(pid: string, by: string | null = null): Promise<LateSeat | null> {
  try {
    const ops = await readOps(["phase", COFFEECHAT_SKIP_KEY]);
    if (isPhase(ops.phase) && MISSION_CLOSED.includes(ops.phase)) return null;
    if (coffeechatSkip(ops[COFFEECHAT_SKIP_KEY]).has(pid.toLowerCase())) return null; // 커피챗 불참으로 정해 둔 사람(10/27 민찬 결정)
    const hasLeft = async () => !!(await myCheckin(pid)).left_at; // 0019 전 DB 면 늘 false
    if (await hasLeft()) return null;
    const { data: v, error } = await db()
      .from("assign_versions")
      .select("version, params")
      .eq("event_id", eventId())
      .eq("round", "coffeechat")
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!v || (v.params as { kind?: string } | null)?.kind === "final") return null;
    const version = v.version as number;
    const readRows = async () => {
      const { data, error: e } = await db().from("table_members").select("table_no, seat_no, participant_id").eq("version", version);
      if (e) throw e;
      return data ?? [];
    };
    const before = await readRows();
    if (!before.length || before.some((r) => r.participant_id === pid)) return null;

    const started = Date.now();
    const asked = await askCompute(pid, version);
    // 계산 서비스를 기다리는 동안 다른 사람이 앉았을 수 있어 대체 테이블 · 좌석 번호는 응답(또는 시간 초과) 뒤에 다시 읽어 센다
    const rows = await readRows();
    if (rows.some((r) => r.participant_id === pid) || (await hasLeft())) return null;
    const left = await leftOf(rows.map((r) => r.participant_id as string));
    // n = 남아 있는 인원(대체 테이블 고르기), k = 나간 사람까지 센 행 수(좌석 번호)
    const count = new Map<number, { n: number; k: number; seat: number }>();
    for (const r of rows) {
      const c = count.get(r.table_no as number) ?? { n: 0, k: 0, seat: 0 };
      count.set(r.table_no as number, { n: c.n + (left.has(r.participant_id as string) ? 0 : 1), k: c.k + 1, seat: Math.max(c.seat, (r.seat_no as number | null) ?? 0) });
    }
    const pick = asked.pick && count.has(asked.pick.table_no) ? asked.pick : null;
    const table_no = pick ? pick.table_no : [...count.entries()].sort((a, b) => a[1].n - b[1].n || a[0] - b[0])[0][0];
    const c = count.get(table_no)!;
    const seat_no = Math.max(c.seat, c.k) + 1; // 가장 큰 좌석 번호와 인원(나간 사람 포함) 중 큰 쪽 + 1
    const reason = pick
      ? { ...pick.reason, late_join: true, table_no, seat_no }
      : { text: FALLBACK_TEXT, late_join: true, fallback: true, table_no, seat_no };
    const { data: ins, error: e3 } = await db()
      .from("table_members")
      .upsert({ version, table_no, participant_id: pid, seat_no, reason }, { onConflict: "version,participant_id", ignoreDuplicates: true })
      .select("participant_id");
    if (e3) throw e3;
    if (!ins?.length) return null; // 동시에 들어온 다른 요청이 먼저 앉혔다

    // 같은 테이블에서 좌석 번호가 겹치면(동시에 늦은 사람 여럿) 한 명만 남기고 나머지를 차례로 다음 번호로 옮긴다.
    //   남기는 사람 = 원래 배정된 사람(late_join 아님) → 없으면 id 가 가장 작은 사람. 여러 요청이 같이 정리해도 같은 결과가 되게 id 순서로 정한다(구현하며 정함)
    const { data: same, error: e4 } = await db().from("table_members").select("participant_id, seat_no, reason").eq("version", version).eq("table_no", table_no);
    if (e4) throw e4;
    const all = same ?? [];
    let next = Math.max(0, all.length, ...all.map((r) => (r.seat_no as number | null) ?? 0));
    const bySeat = new Map<number, typeof all>();
    for (const r of all) if (r.seat_no != null) bySeat.set(r.seat_no as number, [...(bySeat.get(r.seat_no as number) ?? []), r]);
    const isLate = (r: (typeof all)[number]) => !!(r.reason as { late_join?: boolean } | null)?.late_join;
    for (const group of [...bySeat.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
      if (group.length < 2) continue;
      group.sort((a, b) => Number(isLate(a)) - Number(isLate(b)) || ((a.participant_id as string) < (b.participant_id as string) ? -1 : 1));
      for (const move of group.slice(1).sort((a, b) => ((a.participant_id as string) < (b.participant_id as string) ? -1 : 1))) {
        next += 1;
        const { error: e5 } = await db()
          .from("table_members")
          .update({ seat_no: next, reason: { ...((move.reason ?? {}) as Record<string, unknown>), seat_no: next } })
          .eq("version", version)
          .eq("participant_id", move.participant_id as string);
        if (e5) throw e5;
      }
    }
    // 운영자 안내 문구 · 로그가 DB 와 같게 내 좌석 번호를 다시 읽는다
    const { data: me, error: e6 } = await db().from("table_members").select("table_no, seat_no").eq("version", version).eq("participant_id", pid).maybeSingle();
    if (e6) throw e6;
    const final_seat = (me?.seat_no as number | null) ?? seat_no;
    await logEvent("coffeechat_late_seat", pid, { version, table_no, seat_no: final_seat, fallback: !pick, compute_status: asked.status, ms: Date.now() - started, by });
    return { version, table_no, seat_no: final_seat, fallback: !pick };
  } catch (e) {
    console.error("늦게 온 사람 커피챗 자리 실패", pid, e);
    await logEvent("coffeechat_late_seat_fail", pid, { by, message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
