// 참가자 관련 서버 전용 조회. 여러 모듈의 API Route 가 같이 쓴다.
import "server-only";
import { db } from "./db";
import { eventId } from "./api";

export type ParticipantPublic = {
  id: string;
  display_name: string;
  affiliation: string | null;
  role: string;
  cohort: number | null;
  is_host: boolean;
};

export const PUBLIC_COLS = "id, display_name, affiliation, role, cohort, is_host";

export async function getParticipant(id: string) {
  const { data, error } = await db()
    .from("participants")
    .select("id, display_name, affiliation, role, cohort, is_host, is_admin, visibility, consent_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfile(id: string) {
  const { data, error } = await db()
    .from("profiles")
    .select("offer_text, seek_text, topic_tags, intent_tags, links")
    .eq("participant_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 주소와 라벨. 라벨은 앞 2자리 → 앞 1자리 순으로 찾는다.
export async function getSidWithLabel(id: string) {
  const { data: sid, error } = await db()
    .from("sids")
    .select("offer_sid, seek_sid, codebook_version, is_temp")
    .eq("participant_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!sid) return null;
  const label = await labelFor(sid.codebook_version, sid.offer_sid as number[]);
  return { offer_sid: sid.offer_sid as number[], seek_sid: sid.seek_sid as number[], is_temp: sid.is_temp, label };
}

export async function labelFor(codebookVersion: string, sid: number[]): Promise<string | null> {
  const { data, error } = await db().from("labels").select("prefix, label").eq("codebook_version", codebookVersion);
  if (error) throw error;
  const key = (p: number[]) => p.join("-");
  const map = new Map((data ?? []).map((r) => [key(r.prefix as number[]), r.label as string]));
  return map.get(key(sid.slice(0, 2))) ?? map.get(key(sid.slice(0, 1))) ?? null;
}

// 라운드별 최신 published 배정에서 내 테이블
export async function getMyTable(id: string, round: "tabletalk" | "coffeechat") {
  const { data, error } = await db()
    .from("current_tables")
    .select("version, table_no, label")
    .eq("round", round)
    .eq("participant_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 첫 로그인이 곧 체크인이다. 이미 있으면 그대로 둔다.
export async function ensureCheckin(id: string) {
  const { error } = await db().from("checkins").upsert({ participant_id: id }, { onConflict: "participant_id", ignoreDuplicates: true });
  if (error) throw error;
}

export function currentEventId() {
  return eventId();
}
