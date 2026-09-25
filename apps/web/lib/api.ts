// docs/API.md 의 응답 형식. 모든 API Route 는 이 파일의 ok/fail/handle 로만 응답한다.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./session";

export type ApiError = { code: string; message: string };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } satisfies ApiError }, { status });
}

// 라우트 본문을 감싸 공통 오류를 응답 형식으로 바꾼다.
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", e.message, e.status);
    if (e instanceof ZodError) return fail("BAD_INPUT", e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "), 400);
    console.error(e);
    return fail("INTERNAL", "서버 오류가 났다. 잠시 후 다시 시도한다", 500);
  }
}

export function eventId(): string {
  return process.env.EVENT_ID ?? "dev";
}
