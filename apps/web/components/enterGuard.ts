// 참가자 화면 보호(서버 전용). 세션이 없으면 온보딩으로, 첫 진입 카드(동의 · 거부)를 아직 안 지났으면 그 화면으로 보낸다.
// 개발 지시서 v0.2 H-00 · 10/5 회의: 동의를 거부한 사람도 앱에 들어온다(식순 안내, 배정 확인). 거부자가 못 쓰는 기능은 API 가 막는다.
// next 는 온보딩 뒤 돌아올 곳이다(명찰 QR /card?p= · 포스터 QR /poster?c= 로 들어온 사람).
import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getParticipant } from "@/lib/participants";

export async function requireEntered(next: string) {
  const s = await getSession();
  if (!s) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  const p = await getParticipant(s.pid);
  if (!p) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  if (!p.consent_at && !p.consent_refused_at) redirect(`/onboarding/consent?next=${encodeURIComponent(next)}`);
  return p;
}
