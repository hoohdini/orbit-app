// 포스터 화면(피그마 P-1 ~ P-3 · E-02). 이벤트 탭의 하위 화면이라 page 에서 이벤트 탭과 같은 틀(남색 뒤로가기 헤더 · 미션 n/5 띠)을 씌운다. 보호는 page 에서 requireOnboarded 로 한다(_guard.ts).
export const dynamic = "force-dynamic";

export default function PosterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
