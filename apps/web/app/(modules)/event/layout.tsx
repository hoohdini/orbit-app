// 이벤트 탭(개발 지시서 v0.2 E). 미션 스탬프를 모으는 탭이다. 상태 띠에 미션 n/4 를 붙인다.
import { requireEntered } from "@/components/enterGuard";
import TabShell from "@/components/TabShell";

export const dynamic = "force-dynamic";

export default async function EventLayout({ children }: { children: React.ReactNode }) {
  await requireEntered("/event");
  return <TabShell showMission>{children}</TabShell>;
}
