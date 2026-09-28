// 운영 콘솔. 계산 서비스 버튼과 배정 버전 확인 · 공개(담당: 민찬, 9/29). 체크인 관리 · 응답률은 아직 없다.
// 운영자(is_admin)만 들어온다. 글자색을 직접 정한다(globals.css 다크 모드 대비).
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import TopBar from "@/components/TopBar";
import ComputePanel from "./ComputePanel";
import VersionsPanel from "./VersionsPanel";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const s = await getSession();
  if (!s) redirect("/onboarding?next=/ops");
  return (
    <div className="mx-auto min-h-screen max-w-md pb-10 text-gray-900">
      <TopBar title="운영 콘솔" />
      <main className="space-y-4 p-4">
        {s.admin ? (
          <>
            <ComputePanel />
            <VersionsPanel />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">운영자만 쓸 수 있다</p>
        )}
      </main>
    </div>
  );
}
