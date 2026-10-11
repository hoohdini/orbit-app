"use client";
// 피그마 Header Type=Sub(하위 화면). 뒤로가기 + 제목, 높이 56, 배경은 페이지와 같다.
// back 을 주면 그 주소로, 안 주면 브라우저 뒤로가기(첫 화면이면 명함 탭).
// 기본은 남색 그라데이션 헤더(피그마 하위 화면 공통, 10/11 명함 탭도 맞춤). tone="plain" 은 흰 헤더. 뒤로가기 터치 영역 44px
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack } from "./Icons";

export default function SubHeader({ title, back, right, tone = "brand" }: { title: string; back?: string; right?: React.ReactNode; tone?: "plain" | "brand" }) {
  const router = useRouter();
  const brand = tone === "brand";
  const cls = `-ml-3 flex size-11 items-center justify-center ${brand ? "text-white" : "text-ink"}`;
  return (
    <header className={`flex h-14 items-center gap-2 px-5 ${brand ? "bg-gradient-to-r from-[#3262d4] to-navy" : "bg-white"}`}>
      {back ? (
        <Link href={back} aria-label="뒤로" className={cls}>
          <IconBack />
        </Link>
      ) : (
        <button type="button" aria-label="뒤로" className={cls} onClick={() => (window.history.length > 1 ? router.back() : router.push("/card"))}>
          <IconBack />
        </button>
      )}
      <h1 className={`flex-1 truncate ${brand ? "text-center text-lg font-bold text-white" : "text-xl font-medium text-black"}`}>{title}</h1>
      {brand && !right && <span className="size-11" />}
      {right}
    </header>
  );
}
