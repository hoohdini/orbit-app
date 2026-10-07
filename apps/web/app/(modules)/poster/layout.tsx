// 포스터 화면 공통 틀. 이벤트 탭(/event)의 한 부분이라 같은 틀(미션 n/4 를 띠에 붙임)을 쓴다. 보호는 page 에서 requireOnboarded 로 한다(_guard.ts).
import TabShell from "@/components/TabShell";

export const dynamic = "force-dynamic";

export default function PosterLayout({ children }: { children: React.ReactNode }) {
  return <TabShell showMission>{children}</TabShell>;
}
