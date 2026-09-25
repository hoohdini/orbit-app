// 브라우저에서 API Route 를 부르는 얇은 함수. 응답 형식(docs/API.md)을 풀어 준다.
// 이 파일은 브라우저 번들에 들어가므로 server-only 코드를 import 하지 않는다.

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; code: string; message: string; status: number };

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (json !== undefined ? "POST" : "GET"),
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store",
  });
  let body: { ok: boolean; data?: T; error?: { code: string; message: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "BAD_RESPONSE", message: "서버 응답을 읽을 수 없다", status: res.status };
  }
  if (body?.ok) return { ok: true, data: body.data as T, status: res.status };
  return { ok: false, code: body?.error?.code ?? "UNKNOWN", message: body?.error?.message ?? "알 수 없는 오류", status: res.status };
}

// /api/onboarding/me 응답 형식
export type Me = {
  participant: { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; is_host: boolean; is_admin: boolean; visibility: string };
  profile: { offer_text: string; seek_text: string; topic_tags: string[]; intent_tags: string[]; links: Record<string, string> } | null;
  consented: boolean;
  sid: { offer_sid: number[]; seek_sid: number[]; label: string | null; is_temp: boolean } | null;
  table: { table_no: number; label: string | null; version: number } | null;
};
