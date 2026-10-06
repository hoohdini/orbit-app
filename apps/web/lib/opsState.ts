// ops_state 에서 참가자 화면도 읽는 값(단계, 공지, 미션 마감). 운영 콘솔 쓰기는 app/api/ops 에서 한다.
import "server-only";
import { db } from "./db";
import { isPhase, type Phase } from "./phase";

export type Notice = { text: string; preset: string | null; expires_at: string; at: string; by: string };
export type PhaseMeta = { at: string; by: string; prev: string | null };

// 키 여러 개를 한 번에 읽는다
export async function readOps(keys: string[]): Promise<Record<string, unknown>> {
  const { data, error } = await db().from("ops_state").select("key, value").in("key", keys);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value]));
}

export type OpsSnapshot = { phase: Phase | null; phaseMeta: PhaseMeta | null; notice: Notice | null; missionClosedAt: string | null };

export async function opsSnapshot(): Promise<OpsSnapshot> {
  const v = await readOps(["phase", "phase_meta", "notice", "mission_closed_at"]);
  const notice = (v.notice as Notice | null) ?? null;
  return {
    phase: isPhase(v.phase) ? v.phase : null,
    phaseMeta: (v.phase_meta as PhaseMeta | null) ?? null,
    // 만료된 공지는 없는 것으로 본다
    notice: notice && new Date(notice.expires_at).getTime() > Date.now() ? notice : null,
    missionClosedAt: typeof v.mission_closed_at === "string" ? v.mission_closed_at : null,
  };
}
