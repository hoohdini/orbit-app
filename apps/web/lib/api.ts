// docs/API.md 의 응답 형식. 모든 API Route 는 이 두 함수로만 응답한다.
import { NextResponse } from "next/server";

export type ApiError = { code: string; message: string };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } satisfies ApiError }, { status });
}
