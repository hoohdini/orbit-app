// 이용 동의 상태(개발 지시서 v0.2 H-00, 10/5 회의 결정).
// agreed: 동의함. refused: 거부함. pending: 아직 고르지 않음.
// 거부자도 사전 등록 정보로 배정(테이블토크 · 커피챗)에는 들어간다. 행사 중 수집(명함 교환, 만족도, 포스터 응답, 검색어)은 하지 않고,
// 다른 사람의 추천 · 이름 검색 · 궤도에서도 빠진다.
import "server-only";
import { db } from "./db";
import { fail } from "./api";

export type Consent = "agreed" | "refused" | "pending";

export function consentOf(p: { consent_at?: string | null; consent_refused_at?: string | null } | null | undefined): Consent {
  if (p?.consent_at) return "agreed";
  if (p?.consent_refused_at) return "refused";
  return "pending";
}

export async function getConsent(pid: string): Promise<Consent> {
  const { data, error } = await db().from("participants").select("consent_at, consent_refused_at").eq("id", pid).maybeSingle();
  if (error) throw error;
  return consentOf(data);
}

// 행사 중 데이터를 남기는 쓰기 API 앞에서 부른다. 동의한 사람이 아니면 403 응답을 돌려주고, 동의했으면 null
export async function collectGuard(pid: string): Promise<Response | null> {
  const c = await getConsent(pid);
  if (c === "agreed") return null;
  return c === "refused"
    ? fail("CONSENT_REFUSED", "이용 동의를 거부해 이 기능을 쓸 수 없다. 마이페이지에서 다시 동의할 수 있다", 403)
    : fail("CONSENT_REQUIRED", "이용 동의가 필요하다", 403);
}

// ids 중 동의를 거부한 사람. 남의 목록(추천, 이름 검색, 궤도)에서 뺄 때 쓴다
export async function refusedAmong(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("participants").select("id").in("id", ids.slice(i, i + 200)).not("consent_refused_at", "is", null);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.id as string);
  }
  return out;
}
