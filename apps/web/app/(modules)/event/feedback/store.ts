// 행사 후기 읽기 · 쓰기. 서버(/api/event/feedback)를 쓰고, USE_MOCK 이 켜져 있으면 이 기기에 저장한다.
// 동의 거부자는 후기를 낼 수 없다(서버 403 CONSENT_REFUSED, 10/23 민찬 결정).
import { api } from "@/lib/client";
import { USE_MOCK, loadFeedback as loadMock, saveFeedback as saveMock, type Feedback } from "../mock";

export type { Feedback };

// ok false 는 불러오지 못한 경우(401 · 500 · 네트워크). 낸 적이 없으면 ok true, feedback null
export type Loaded = { ok: true; feedback: Feedback | null } | { ok: false };

export async function loadFeedback(): Promise<Loaded> {
  if (USE_MOCK) return { ok: true, feedback: loadMock() };
  const r = await api<{ feedback: Feedback | null }>("/api/event/feedback");
  return r.ok ? { ok: true, feedback: r.data.feedback } : { ok: false };
}

// 저장에 성공하면 null, 실패하면 화면에 보여 줄 문구
export async function saveFeedback(f: Feedback): Promise<string | null> {
  if (USE_MOCK) {
    saveMock(f);
    return null;
  }
  const r = await api<{ saved: true }>("/api/event/feedback", { json: { rating: f.rating, tags: f.tags, comment: f.comment || undefined } });
  if (r.ok) return null;
  if (r.code === "FEEDBACK_NOT_OPEN") return "커피챗이 끝난 뒤 남길 수 있습니다";
  if (r.code === "CONSENT_REFUSED") return REFUSED_TEXT;
  if (r.status === 403) return "이용 동의 여부를 먼저 골라 주세요. 마이페이지에서 고를 수 있습니다";
  return "후기를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요";
}

// 동의 거부자에게 보이는 안내(입력 화면 · 저장 실패 문구가 같이 쓴다)
export const REFUSED_TEXT = "이용 동의를 하지 않아 후기를 남길 수 없습니다. 마이페이지에서 다시 동의하면 남길 수 있습니다";
