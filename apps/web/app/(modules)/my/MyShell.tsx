// 마이페이지 공통 틀. title 이 없으면 탭 첫 화면(큰 제목 마이페이지), 있으면 남색 뒤로가기 헤더(피그마 명함 편집 · 내 정보 등)
import TabShell from "@/components/TabShell";
import TabHeader from "@/components/figma/TabHeader";
import SubHeader from "@/components/figma/SubHeader";

export default function MyShell({ children, title, back = "/my" }: { children: React.ReactNode; title?: string; back?: string }) {
  return <TabShell header={title ? <SubHeader title={title} back={back} tone="brand" /> : <TabHeader title="마이페이지" />}>{children}</TabShell>;
}
