// 테이블토크 모듈 보호 (담당: 민찬). home/layout.tsx 와 같은 규칙이다.
// 9/27 회의로 테이블토크와 커피챗을 이 한 페이지에 합쳤다. /coffeechat 은 여기로 보낸다.
// 글자색을 직접 정한다. globals.css 가 폰 다크 모드에서 글자를 밝게 바꿔 흰 카드 위에서 안 보이기 때문이다
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getParticipant } from "@/lib/participants";
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function TabletalkLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/onboarding?next=/tabletalk");
  const p = await getParticipant(s.pid);
  if (!p) redirect("/onboarding?next=/tabletalk");
  if (!p.consent_at) redirect("/onboarding/consent");
  return (
    <div className="mx-auto min-h-screen max-w-md pb-20 text-gray-900">
      {children}
      <BottomNav />
    </div>
  );
}
