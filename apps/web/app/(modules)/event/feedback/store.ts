// 행사 후기 읽기 · 쓰기. 서버(/api/event/feedback)를 쓰고, USE_MOCK 이 켜져 있으면 이 기기에 저장한다.
import { api } from "@/lib/client";
import { USE_MOCK, loadFeedback as loadMock, saveFeedback as saveMock, type Feedback } from "../mock";

export type { Feedback };

export async function loadFeedback(): Promise<Feedback | null> {
  if (USE_MOCK) return loadMock();
  const r = await api<{ feedback: Feedback | null }>("/api/event/feedback");
  return r.ok ? r.data.feedback : null;
}

// 저장에 성공하면 null, 실패하면 화면에 보여 줄 문구
export async function saveFeedback(f: Feedback): Promise<string | null> {
  if (USE_MOCK) {
    saveMock(f);
    return null;
  }
  const r = await api<{ saved: true }>("/api/event/feedback", { json: { rating: f.rating, tags: f.tags, comment: f.comment || undefined } });
  return r.ok ? null : r.status === 403 ? "이용 동의를 하지 않아 후기를 남길 수 없습니다" : "후기를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요";
}
