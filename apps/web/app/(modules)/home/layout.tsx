// 홈 모듈 보호. 세션이 없으면 온보딩으로, 동의 전이면 동의 화면으로 보낸다.
// 다른 모듈도 이 파일을 복사해 같은 방식으로 보호한다(docs/MODULES.md).
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getParticipant } from "@/lib/participants";
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/onboarding");
  const p = await getParticipant(s.pid);
  if (!p) redirect("/onboarding");
  if (!p.consent_at) redirect("/onboarding/consent");
  return (
    <div className="mx-auto min-h-screen max-w-md pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
