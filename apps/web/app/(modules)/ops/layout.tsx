// 운영 콘솔 보호 (담당: 성하). 참가자 화면과 같은 로그인을 쓰되 participants.is_admin 인 사람만 들어온다.
// 참가자 화면과는 별개의 페이지다. BottomNav 같은 참가자용 컴포넌트를 쓰지 않고, DB 만 같이 쓴다(lib/db 를 API Route 에서만).
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getParticipant } from "@/lib/participants";

export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/onboarding?next=/ops");
  const p = await getParticipant(s.pid);
  if (!p) redirect("/onboarding?next=/ops");
  if (!p.is_admin) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold">운영 콘솔</h1>
        <p className="mt-3 text-sm text-gray-700">운영자만 쓸 수 있다. {p.display_name} 님의 계정은 운영자가 아니다.</p>
        <p className="mt-1 text-xs text-gray-500">운영자로 쓰려면 DB 의 participants.is_admin 을 켠다.</p>
      </main>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between">
          <h1 className="text-lg font-bold">ORBIT 운영 콘솔</h1>
          <span className="text-xs text-gray-500">{p.display_name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl p-6">{children}</div>
    </div>
  );
}
