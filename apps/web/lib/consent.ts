// 이용 동의 상태(개발 지시서 v0.2 H-00, 10/5 회의 결정).
// agreed: 동의함. refused: 거부함. pending: 아직 고르지 않음.
// 거부자도 사전 등록 정보로 배정(테이블토크 · 커피챗)에는 들어간다. 행사 중 수집(명함 교환, 만족도, 포스터 응답, 검색어)은 하지 않고,
// 다른 사람의 추천 · 이름 검색 · 궤도에서도 빠진다.
// 10/11(0014): 동의를 두 항목으로 나눴다(피그마 마이페이지 내 정보).
//   collect = 개인정보 수집 및 이용(consent_at · consent_refused_at). 행사 중 기록을 남기는 쓰기 API 를 막는다(collectGuard)
//   share   = 명함 공개 및 추천 활용(share_consent_at · share_refused_at). 거부하면 남의 추천 · 이름 검색 · 궤도에서 빠지고 명함 교환을 주고받지 않는다
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

export function shareOf(p: { share_consent_at?: string | null; share_refused_at?: string | null } | null | undefined): Consent {
  if (p?.share_consent_at) return "agreed";
  if (p?.share_refused_at) return "refused";
  return "pending";
}

export async function getShare(pid: string): Promise<Consent> {
  const { data, error } = await db().from("participants").select("share_consent_at, share_refused_at").eq("id", pid).maybeSingle();
  if (error) throw error;
  return shareOf(data);
}

// 명함을 주고받는 API(교환 · 교환 확인) 앞에서 부른다. 명함 공개를 거부했으면 403
export async function shareGuard(pid: string): Promise<Response | null> {
  return (await getShare(pid)) === "refused" ? fail("SHARE_REFUSED", "명함 공개 및 추천 활용에 동의하지 않아 명함을 주고받을 수 없다. 마이페이지에서 바꿀 수 있다", 403) : null;
}

// ids 중 이용 동의(collect) 또는 명함 공개(share)를 거부한 사람. 남의 목록(추천, 이름 검색, 궤도)에서 뺄 때 쓴다
export async function refusedAmong(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("participants").select("id").in("id", ids.slice(i, i + 200)).or("consent_refused_at.not.is.null,share_refused_at.not.is.null");
    if (error) throw error;
    for (const r of data ?? []) out.add(r.id as string);
  }
  return out;
}
