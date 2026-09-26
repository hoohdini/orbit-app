// 명함 모듈 라우트 보호. home/layout.tsx 와 같은 규칙인데, /card?p= 로 들어온 사람은 온보딩 뒤 제자리로 돌아와야 해서
// layout 이 아니라 page 마다 next 를 넘겨 부른다(layout 은 검색 파라미터를 모른다).
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
