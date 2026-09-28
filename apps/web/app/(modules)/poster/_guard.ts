// 포스터 모듈 라우트 보호. card/_guard.ts 와 같은 규칙이다.
// 폰 기본 카메라로 포스터 QR(/poster?c=)을 찍고 들어온 사람은 온보딩 뒤 그 포스터로 돌아와야 해서 page 에서 next 를 넘겨 부른다.
import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getParticipant } from "@/lib/participants";

export async function requireOnboarded(next: string): Promise<string> {
  const s = await getSession();
  if (!s) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  const p = await getParticipant(s.pid);
  if (!p) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  if (!p.consent_at) redirect("/onboarding/consent");
  return s.pid;
}
