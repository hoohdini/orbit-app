// 행사 후기 읽기 · 쓰기. 서버(/api/event/feedback)를 쓰고, USE_MOCK 이 켜져 있으면 이 기기에 저장한다.
// 동의 거부자의 후기는 사람과 잇지 않고 저장해서(0019) 서버에서 다시 읽을 수 없다. 그래서 방금 낸 내용을 이 탭(sessionStorage)에 두고 완료 화면이 읽는다(10/22).
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

// 방금 낸 후기. anonymous 는 동의 거부자라 사람과 잇지 않고 저장된 경우(스탬프 없음)
export type Submitted = { feedback: Feedback; anonymous: boolean };
const LAST_KEY = "orbit:last-feedback";

export function lastSubmitted(): Submitted | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Submitted) : null;
  } catch {
    return null;
  }
}

function remember(v: Submitted) {
  try {
    sessionStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {}
}

// 저장에 성공하면 { anonymous }, 실패하면 { error: 화면에 보여 줄 문구 }
export async function saveFeedback(f: Feedback): Promise<{ anonymous: boolean } | { error: string }> {
  if (USE_MOCK) {
    saveMock(f);
    return { anonymous: false };
  }
  const r = await api<{ saved: true; anonymous: boolean; stamp: boolean }>("/api/event/feedback", { json: { rating: f.rating, tags: f.tags, comment: f.comment || undefined } });
  if (r.ok) {
    remember({ feedback: f, anonymous: r.data.anonymous });
    return { anonymous: r.data.anonymous };
  }
  if (r.code === "FEEDBACK_NOT_OPEN") return { error: "커피챗이 끝난 뒤 남길 수 있습니다" };
  if (r.status === 403) return { error: "이용 동의 여부를 먼저 골라 주세요. 마이페이지에서 고를 수 있습니다" };
  return { error: "후기를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요" };
}
