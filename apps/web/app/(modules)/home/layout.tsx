// 홈은 v0.2 에서 명함 탭(/card)으로 바뀌었다. 사용설명서(/home/guide)만 남는다.
import { requireEntered } from "@/components/enterGuard";
import TabShell from "@/components/TabShell";

export const dynamic = "force-dynamic";

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requireEntered("/home");
  return <TabShell>{children}</TabShell>;
}
