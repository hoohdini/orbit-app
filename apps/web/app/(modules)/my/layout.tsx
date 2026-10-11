// 마이페이지 탭(개발 지시서 v0.2 M, 피그마 마이페이지 10/11). 틀은 화면마다 MyShell 로 씌운다(탭 첫 화면은 큰 제목, 하위 화면은 뒤로가기 헤더).
import { requireEntered } from "@/components/enterGuard";

export const dynamic = "force-dynamic";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  await requireEntered("/my");
  return children;
}
