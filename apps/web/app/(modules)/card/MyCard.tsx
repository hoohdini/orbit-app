"use client";
// 명함 탭 첫 화면(개발 지시서 v0.2 H-02 ~ H-06, 피그마 iPhone 16 - 3). 앱을 열면 보이는 기본 탭이다.
// 위 남색 영역의 개기일식 원을 누르면 내 명함 QR(/card/qr), 아래 세 줄은 명함 스캔하기 · 오늘 만나면 좋을 분 · 교환한 명함 목록.
// 명함 편집(공개 범위, 링크)은 마이페이지(/my, M-01)에 있다.
// 동의를 거부한 사람(이용 또는 명함 공개)은 내 QR 만 보이고 교환 · 추천은 쓰지 않는다(API 가 막는다).
// 10/11 모바일 비율: 남색 영역은 남는 높이를 채우고(작은 폰에서 줄고 큰 폰에서 늘어남), 일식은 제목 아래 남는 칸에 맞춰 비율로 줄고 늘어난다.
// 일식 모양은 components/figma/HomeEclipse(포스터 모양 기본, 예전 모양으로 되돌리기 가능)
import Link from "next/link";
import { useOrbitState } from "@/components/useOrbitState";
import { useFit } from "@/components/figma/useFit";
import { IconScan } from "@/components/figma/Icons";
import HomeEclipse from "@/components/figma/HomeEclipse";

const row = "relative flex h-[70px] items-center rounded-[25px] border border-navy bg-white px-[23px] text-base font-medium text-ink";

export default function MyCard() {
  const state = useOrbitState();
  // 이용 동의(collect)나 명함 공개(share)를 거부하면 교환 · 추천을 쓰지 않는다(0014)
  const refused = state?.consent === "refused" || state?.share === "refused";
  const [area, , size] = useFit<HTMLDivElement>(376);

  return (
    <main className="flex flex-1 flex-col px-[9px]">
      <section className="relative -mt-px flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-b-[25px] border-[1.5px] border-t-0 border-black bg-gradient-to-b from-hero-from to-hero-to" style={{ maxHeight: 600 }}>
        {/* 10/11: 글자는 줄이고(2026 은 더 작게) 일식을 키웠다 */}
        <h1 className="relative z-10 shrink-0 px-[23px] pt-4 font-semibold leading-[1.25] text-white">
          <span className="block text-[clamp(15px,4.4vw,19px)] font-medium opacity-90">2026</span>
          <span className="block text-[clamp(24px,7.4vw,31px)]">DSL Gathering Night</span>
          <span className="block text-[clamp(24px,7.4vw,31px)]">: The ORBIT</span>
        </h1>
        <div ref={area} className="relative flex-1">
          <HomeEclipse w={size.w} h={size.h} />
        </div>
      </section>

      {refused ? (
        <p className="mt-2 rounded-[25px] border border-navy bg-white p-5 text-sm text-ink-2">
          이용 동의를 하지 않아 명함 교환과 추천을 쓸 수 없습니다.{" "}
          <Link href="/my/info" className="underline">
            마이페이지
          </Link>
          에서 다시 동의할 수 있습니다
        </p>
      ) : (
        <nav className="mt-2 space-y-[9px]">
          <Link href="/card/scan?via=card" className={row}>
            <span className="flex-1">명함 스캔하기</span>
            <IconScan className="text-ink" />
          </Link>
          <Link href="/card/recs" className={row}>
            오늘 만나면 좋을 분
          </Link>
          <WalletRow />
        </nav>
      )}
      {refused && (
        <nav className="mt-[9px]">
          <WalletRow />
        </nav>
      )}
    </main>
  );
}

function WalletRow() {
  return (
    <Link href="/card/wallet" className={`${row} overflow-hidden`}>
      <span className="flex-1">교환한 명함 목록</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/figma/dsl-logo-soft.svg" className="h-[42px] w-[73px]" />
    </Link>
  );
}
