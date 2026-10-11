// 이벤트 탭 공통 틀. title 이 없으면 탭 첫 화면(큰 제목 이벤트·미션), 있으면 뒤로가기 헤더(피그마 P-0 · E-03 ~ E-05). 상태 띠에 미션 n/5 를 붙인다
import TabShell from "@/components/TabShell";
import TabHeader from "@/components/figma/TabHeader";
import SubHeader from "@/components/figma/SubHeader";

export default function EventShell({ children, title, back = "/event" }: { children: React.ReactNode; title?: string; back?: string }) {
  return (
    <TabShell showMission header={title ? <SubHeader title={title} back={back} tone="brand" /> : <TabHeader title="이벤트·미션" />}>
      {children}
    </TabShell>
  );
}
