// 피그마 내 명함 QR · QR 스캔 화면의 틀. 남색 그라데이션 전면, 위에 가운데 제목과 닫기(X), 하단 메뉴 없음.
// 화면 높이를 꽉 채운다: 위 제목, 가운데 개기일식(폭에 맞춰 비율), 아래 결과 카드 · 안내는 화면 아래쪽에 붙는다(footer)
import Link from "next/link";
import { IconClose } from "@/components/figma/Icons";

export default function DarkScreen({ title, close, children, footer }: { title: string; close: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center overflow-clip bg-gradient-to-b from-navy to-navy-2 text-white">
      <div className="flex w-full max-w-md flex-col">
        <header className="relative flex h-14 shrink-0 items-center justify-center">
          <h1 className="text-lg font-bold tracking-[-0.18px]">{title}</h1>
          <Link href={close} aria-label="닫기" className="absolute right-2 top-1 flex size-12 items-center justify-center text-white">
            <IconClose />
          </Link>
        </header>
        <div className="flex flex-1 flex-col justify-center py-4">{children}</div>
        {footer && <div className="shrink-0 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
