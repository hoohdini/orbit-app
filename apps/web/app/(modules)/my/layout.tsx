// 마이페이지 탭(개발 지시서 v0.2 M). 편집과 계정 기능을 모아 둔다. 행사 중 자주 열 필요가 없는 것만 둔다.
import { requireEntered } from "@/components/enterGuard";
import TabShell from "@/components/TabShell";

export const dynamic = "force-dynamic";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  await requireEntered("/my");
  return <TabShell>{children}</TabShell>;
}
