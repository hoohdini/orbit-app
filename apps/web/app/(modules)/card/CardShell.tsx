// 명함 탭 공통 틀. 4탭 틀(TabShell)에 받은 명함 알림(CardInbox)을 붙인다. header 는 피그마 하위 화면의 Header(뒤로가기 + 제목)
import TabShell from "@/components/TabShell";
import CardInbox from "./CardInbox";

export default function CardShell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <TabShell header={header} extra={<CardInbox />}>
      {children}
    </TabShell>
  );
}
