// 이벤트 탭(개발 지시서 v0.2 E). 미션 스탬프를 모으는 탭이다. 틀(헤더 · 상태 띠 · 하단 메뉴)은 화면마다 EventShell 로 씌운다(피그마: 탭 첫 화면은 큰 제목, 하위 화면은 뒤로가기 헤더).
import { requireEntered } from "@/components/enterGuard";

export const dynamic = "force-dynamic";

export default async function EventLayout({ children }: { children: React.ReactNode }) {
  await requireEntered("/event");
  return children;
}
