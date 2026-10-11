"use client";
// 피그마 Header Type=Sub(하위 화면). 뒤로가기 + 제목, 높이 56, 배경은 페이지와 같다.
// back 을 주면 그 주소로, 안 주면 브라우저 뒤로가기(첫 화면이면 명함 탭).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack } from "./Icons";

export default function SubHeader({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  const router = useRouter();
  const cls = "-ml-1 flex size-8 items-center justify-center text-ink";
  return (
    <header className="flex h-14 items-center gap-2 bg-white px-5">
      {back ? (
        <Link href={back} aria-label="뒤로" className={cls}>
          <IconBack />
        </Link>
      ) : (
        <button type="button" aria-label="뒤로" className={cls} onClick={() => (window.history.length > 1 ? router.back() : router.push("/card"))}>
          <IconBack />
        </button>
      )}
      <h1 className="flex-1 truncate text-xl font-medium text-black">{title}</h1>
      {right}
    </header>
  );
}
