// 명함 탭(v0.2 4탭 중 첫 탭, 앱을 열면 여기). 보호는 page 마다 requireOnboarded 로 한다(_guard.ts).
// 틀(하단 메뉴 · 상태 띠 · 받은 명함 알림)은 화면마다 CardShell 로 씌운다. 피그마의 QR 스캔 · 내 명함 QR 은 하단 메뉴 없는 전면 화면이라서다(10/11).
export const dynamic = "force-dynamic";

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
