"use client";
// 명함 탭 첫 화면(개발 지시서 v0.2 H-02 ~ H-06, 피그마 iPhone 16 - 3). 앱을 열면 보이는 기본 탭이다.
// 위 남색 영역의 개기일식 원을 누르면 내 명함 QR(/card/qr), 아래 세 줄은 명함 스캔하기 · 오늘 만나면 좋을 분 · 교환한 명함 목록.
// 명함 편집(공개 범위, 링크)은 마이페이지(/my, M-01)에 있다.
// 동의를 거부한 사람은 내 QR 만 보이고 교환 · 추천은 쓰지 않는다(API 가 막는다).
import Link from "next/link";
import { useOrbitState } from "@/components/useOrbitState";
import { IconQr, IconScan } from "@/components/figma/Icons";

const row = "relative flex h-[70px] items-center rounded-[25px] border border-line bg-white px-[23px] text-base font-medium text-black";

export default function MyCard() {
  const state = useOrbitState();
  // 이용 동의(collect)나 명함 공개(share)를 거부하면 교환 · 추천을 쓰지 않는다(0014)
  const refused = state?.consent === "refused" || state?.share === "refused";

  return (
    <main className="px-[9px]">
      <section className="relative -mt-px h-[450px] overflow-hidden rounded-b-[25px] border-[1.5px] border-t-0 border-black bg-gradient-to-b from-hero-from to-hero-to">
        <h1 className="absolute left-[23px] top-[18px] text-[36px] font-semibold leading-[50px] text-white">
          2026
          <br />
          DSL
          <br />
          Gathering Night
          <br />: The ORBIT
        </h1>
        {/* eslint-disable @next/next/no-img-element */}
        <img alt="" src="/figma/home-line1.svg" className="pointer-events-none absolute left-[87px] top-[315px] h-[25px] w-[326px] max-w-none -rotate-[44.08deg]" />
        <img alt="" src="/figma/home-line2.svg" className="pointer-events-none absolute left-[97px] top-[326px] h-px w-[301px] max-w-none -rotate-[44.37deg]" />
        <Link href="/card/qr" aria-label="내 명함 QR 크게 보기" className="absolute left-[134px] top-[212px] block size-[232px]">
          <img alt="" src="/figma/home-ring.svg" className="absolute inset-0 size-full max-w-none" />
          <img alt="" src="/figma/home-disc.svg" className="absolute left-[22px] top-[25px] h-[189px] w-[188px] max-w-none" />
          <span className="absolute left-[88px] top-[87px] flex size-[56px] items-center justify-center text-white">
            <IconQr />
          </span>
        </Link>
        {/* eslint-enable @next/next/no-img-element */}
      </section>

      {refused ? (
        <p className="mt-2 rounded-[25px] border border-line bg-white p-5 text-sm text-ink-2">
          이용 동의를 하지 않아 명함 교환과 추천을 쓸 수 없어요.{" "}
          <Link href="/my/info" className="underline">
            마이페이지
          </Link>
          에서 다시 동의할 수 있어요
        </p>
      ) : (
        <nav className="mt-2 space-y-[9px]">
          <Link href="/card/scan?via=card" className={row}>
            <span className="flex-1">명함 스캔하기</span>
            <IconScan className="text-black" />
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
