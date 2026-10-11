"use client";
// 명함 탭 첫 화면(개발 지시서 v0.2 H-02 ~ H-06, 피그마 iPhone 16 - 3). 앱을 열면 보이는 기본 탭이다.
// 위 남색 영역의 개기일식 원을 누르면 내 명함 QR(/card/qr), 아래 세 줄은 명함 스캔하기 · 오늘 만나면 좋을 분 · 교환한 명함 목록.
// 명함 편집(공개 범위, 링크)은 마이페이지(/my, M-01)에 있다.
// 동의를 거부한 사람(이용 또는 명함 공개)은 내 QR 만 보이고 교환 · 추천은 쓰지 않는다(API 가 막는다).
// 10/11 모바일 비율: 남색 영역은 남는 높이를 채우고(작은 폰에서 줄고 큰 폰에서 늘어남), 원과 선은 그 크기에 맞춰 비율로 줄고 늘어난다
import Link from "next/link";
import { useOrbitState } from "@/components/useOrbitState";
import { useFit } from "@/components/figma/useFit";
import { IconQr, IconScan } from "@/components/figma/Icons";

const row = "relative flex h-[70px] items-center rounded-[25px] border border-navy bg-white px-[23px] text-base font-medium text-ink";

export default function MyCard() {
  const state = useOrbitState();
  // 이용 동의(collect)나 명함 공개(share)를 거부하면 교환 · 추천을 쓰지 않는다(0014)
  const refused = state?.consent === "refused" || state?.share === "refused";
  const [hero, , size] = useFit<HTMLElement>(376);
  // 원 무리(지름 232) 크기: 폭과, 제목(네 줄, 폭에 따라 약 170~240px) 아래 남는 높이 중 작은 쪽에 맞춘다
  const titleBottom = 18 + 4 * 1.38 * Math.min(40, Math.max(30, size.w * 0.095));
  const s = Math.max(0.55, Math.min(1.2, size.w / 376, size.h > 0 ? (size.h - titleBottom - 8) / 238 : 1));

  return (
    <main className="flex flex-1 flex-col px-[9px]">
      <section ref={hero} className="relative -mt-px min-h-[300px] flex-1 overflow-hidden rounded-b-[25px] border-[1.5px] border-t-0 border-black bg-gradient-to-b from-hero-from to-hero-to" style={{ maxHeight: 560 }}>
        <h1 className="absolute left-[23px] top-[18px] text-[clamp(30px,9.5vw,40px)] font-semibold leading-[1.38] text-white">
          2026
          <br />
          DSL
          <br />
          Gathering Night
          <br />: The ORBIT
        </h1>
        <Link
          href="/card/qr"
          aria-label="내 명함 QR 크게 보기"
          className="absolute block size-[232px] origin-bottom-right"
          style={{ right: 10 * s, bottom: 6 * s, transform: `scale(${s})` }}
        >
          {/* eslint-disable @next/next/no-img-element */}
          <img alt="" src="/figma/home-line1.svg" className="pointer-events-none absolute left-[-47px] top-[103px] h-[25px] w-[326px] max-w-none -rotate-[44.08deg]" />
          <img alt="" src="/figma/home-line2.svg" className="pointer-events-none absolute left-[-35px] top-[115px] h-px w-[301px] max-w-none -rotate-[44.37deg]" />
          <img alt="" src="/figma/home-ring.svg" className="absolute inset-0 size-full max-w-none" />
          <img alt="" src="/figma/home-disc.svg" className="absolute left-[22px] top-[25px] h-[189px] w-[188px] max-w-none" />
          {/* eslint-enable @next/next/no-img-element */}
          <span className="absolute left-[88px] top-[87px] flex size-[56px] items-center justify-center text-white">
            <IconQr />
          </span>
        </Link>
      </section>

      {refused ? (
        <p className="mt-2 rounded-[25px] border border-navy bg-white p-5 text-sm text-ink-2">
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
