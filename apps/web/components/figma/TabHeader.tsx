// 피그마 Header Type=Tab(네트워킹 · 이벤트·미션 · 마이 탭 맨 위). 왼쪽 큰 제목 22, 파랑→남색 그라데이션, 높이 56.
// 오른쪽 종 아이콘은 피그마 명세 A30(연결 화면 없음)이라 그리지 않는다.
export default function TabHeader({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center bg-gradient-to-r from-[#3262d4] to-navy px-5">
      <h1 className="text-[22px] font-bold leading-[30px] tracking-[-0.44px] text-white">{title}</h1>
    </header>
  );
}
