// 포스터 모듈 공통 틀. 보호는 page 에서 requireOnboarded 로 한다(_guard.ts).
// 글자색을 직접 정한다. globals.css 가 폰 다크 모드에서 글자를 밝게 바꿔 흰 카드 위에서 안 보이기 때문이다
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default function PosterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md pb-20 text-gray-900">
      {children}
      <BottomNav />
    </div>
  );
}
