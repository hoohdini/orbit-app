// event_log 에 한 줄 남긴다. 실패해도 본 요청을 막지 않는다.
import "server-only";
import { db } from "./db";

export async function logEvent(kind: string, participantId: string | null, payload: Record<string, unknown> = {}) {
  try {
    await db().from("event_log").insert({ kind, participant_id: participantId, payload });
  } catch (e) {
    console.error("event_log 실패", kind, e);
  }
}
