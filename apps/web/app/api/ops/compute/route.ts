// 계산 서비스 호출 (운영자 전용, 담당: 민찬). 운영 콘솔의 계산 버튼이 부른다.
// GET  계산 서비스 상태(/health)
// POST { job } 계산을 돌린다. 결과는 전부 초안(draft)이고 운영자가 공개해야 참가자에게 보인다.
//   precompute  행사 전날. 새 코드북 · 전원 주소 · 테이블토크 배정
//   checkin     체크인 마감. 저장된 코드북으로 현장 등록자에게 주소만 붙인다(테이블토크는 전날 확정, 새 초안 없음)
//   coffeechat  포스터세션 중. 만남 · 만족도 · 포스터 관심도를 반영해 커피챗 배정 · 추천
//   final       시상 · 폐회 뒤. 행사 직후 추천: 공개된 커피챗 그룹은 그대로 두고 추천 목록만 다시(동석자 · 교환한 사람 제외)
// 계산 서비스 주소와 비밀키(COMPUTE_URL · COMPUTE_SECRET)는 서버에만 있고 브라우저에는 가지 않는다.
import { z } from "zod";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 첫 호출은 모델을 올리느라 오래 걸릴 수 있다

const TIMEOUT_MS = 55_000;

const JOBS = {
  precompute: { path: "/precompute", body: {} },
  checkin: { path: "/precompute", body: { reuse_codebook: true } },
  coffeechat: { path: "/coffeechat", body: {} },
  final: { path: "/coffeechat", body: { final: true } },
} as const;

const Body = z.object({ job: z.enum(["precompute", "checkin", "coffeechat", "final"]) });

function computeUrl(): string | null {
  const u = (process.env.COMPUTE_URL ?? "").trim().replace(/\/+$/, "");
  return u || null;
}

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown } | null> {
  const base = computeUrl();
  if (!base) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + path, { ...init, signal: ctl.signal, cache: "no-store" });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    if (!computeUrl()) return fail("COMPUTE_NOT_SET", "계산 서비스 주소(COMPUTE_URL)가 설정되지 않았다", 500);
    const r = await call("/health");
    if (!r || r.status !== 200) return ok({ reachable: false });
    return ok({ reachable: true, ...(r.body as object) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireAdmin();
    const b = Body.parse(await req.json());
    const job = JOBS[b.job];
    if (!computeUrl()) return fail("COMPUTE_NOT_SET", "계산 서비스 주소(COMPUTE_URL)가 설정되지 않았다", 500);

    const started = Date.now();
    const r = await call(job.path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compute-Secret": process.env.COMPUTE_SECRET ?? "" },
      body: JSON.stringify({ event_id: eventId(), ...job.body }),
    });
    const ms = Date.now() - started;
    await logEvent("ops_compute", s.pid, { job: b.job, status: r?.status ?? 0, ms });

    if (!r) return fail("COMPUTE_UNREACHABLE", "계산 서비스에 연결하지 못했거나 55초 안에 끝나지 않았다", 500);
    const detail = (r.body as { detail?: unknown } | null)?.detail;
    if (r.status === 401) return fail("COMPUTE_SECRET", "계산 서비스 비밀키(COMPUTE_SECRET)가 맞지 않는다", 500);
    // 409 = 계산 서비스가 거절한 경우(사람 부족, 저장된 코드북 없음 등). 이유를 그대로 보여 준다
    if (r.status === 409) return fail("COMPUTE_REFUSED", typeof detail === "string" ? detail : "계산 서비스가 거절했다", 409);
    if (r.status !== 200) return fail("COMPUTE_FAILED", `계산 서비스 오류(${r.status})`, 500);
    // 행사 직후 추천을 모르는 예전 계산 서비스는 final 을 무시하고 커피챗을 새로 배정한다. 응답에 final 이 없으면 막는다
    if (b.job === "final" && (r.body as { final?: unknown } | null)?.final !== true)
      return fail("COMPUTE_OLD", "계산 서비스가 행사 직후 추천을 모르는 예전 버전이다. 방금 생긴 커피챗 초안은 공개하지 말고 계산 서비스를 새로 받는다", 409);
    return ok({ job: b.job, ms, result: r.body });
  });
}
