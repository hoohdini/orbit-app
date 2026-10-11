// 피그마 내 명함 QR · QR 스캔 화면의 틀. 남색 그라데이션 전면, 위에 가운데 제목과 닫기(X), 하단 메뉴 없음.
import Link from "next/link";
import { IconClose } from "@/components/figma/Icons";

export default function DarkScreen({ title, close, children }: { title: string; close: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center overflow-clip bg-gradient-to-b from-navy to-navy-2 text-white">
      <div className="relative flex w-full max-w-[393px] flex-col items-center pb-10">
        <header className="relative flex h-14 w-full items-center justify-center">
          <h1 className="text-lg font-bold tracking-[-0.18px]">{title}</h1>
          <Link href={close} aria-label="닫기" className="absolute right-5 top-4 text-white">
            <IconClose />
          </Link>
        </header>
        <div className="mt-[53px]">{children}</div>
      </div>
    </div>
  );
}
