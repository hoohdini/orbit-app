// 명함 모듈 공통 틀. 보호는 page 마다 requireOnboarded 로 한다(_guard.ts).
import BottomNav from "@/components/BottomNav";
import CardInbox from "./CardInbox";

export const dynamic = "force-dynamic";

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-20">
      {children}
      <CardInbox />
      <BottomNav />
    </div>
  );
}
