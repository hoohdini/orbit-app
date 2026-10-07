// 명함 탭 공통 틀(v0.2 4탭 중 첫 탭, 앱을 열면 여기). 보호는 page 마다 requireOnboarded 로 한다(_guard.ts).
import TabShell from "@/components/TabShell";
import CardInbox from "./CardInbox";

export const dynamic = "force-dynamic";

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return <TabShell extra={<CardInbox />}>{children}</TabShell>;
}
