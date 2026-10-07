// 네트워킹 탭(개발 지시서 v0.2 N). 배정된 시간에 배정된 사람을 보여 준다. 테이블토크 · 커피챗을 한 탭에 합쳤다(결정 1).
import { requireEntered } from "@/components/enterGuard";
import TabShell from "@/components/TabShell";

export const dynamic = "force-dynamic";

export default async function NetworkingLayout({ children }: { children: React.ReactNode }) {
  await requireEntered("/networking");
  return <TabShell>{children}</TabShell>;
}
