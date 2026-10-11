"use client";
// 명함 홈 남색 영역의 개기일식(누르면 내 명함 QR). 두 가지 모양을 둔다(10/11).
//   poster  : 행사 포스터와 같은 모양. 검은 원판 + 밝은 테두리, 파란 코로나 빛, 대각선 플레어, 흩어진 별(피그마 Eclipse Viewfinder 에셋)
//   classic : 처음 피그마 홈 화면(iPhone 16 - 3)의 링 + 원판 + 가는 선 두 줄
// 되돌리기: 환경변수 NEXT_PUBLIC_HOME_ECLIPSE=classic 을 넣고 다시 배포하면 예전 모양으로 바뀐다(코드 수정 없이). 기본은 poster
// 크기는 들어갈 칸(폭 w · 높이 h)에 맞춘다. poster 는 393×420 무대를 칸에 맞춰 비율로, classic 은 지름 232 무리를 비율로
import Link from "next/link";
import Eclipse from "./Eclipse";
import { IconQr } from "./Icons";

export const HOME_ECLIPSE: "poster" | "classic" = process.env.NEXT_PUBLIC_HOME_ECLIPSE === "classic" ? "classic" : "poster";

export default function HomeEclipse({ w, h }: { w: number; h: number }) {
  return HOME_ECLIPSE === "classic" ? <Classic w={w} h={h} /> : <Poster w={w} h={h} />;
}

function Poster({ w, h }: { w: number; h: number }) {
  // 무대 폭: 칸 폭과 높이(420 비율) 중 작은 쪽, 너무 커지지 않게 460
  const stageW = Math.max(220, Math.min(w, (h * 393) / 420, 460));
  return (
    <Link href="/card/qr" aria-label="내 명함 QR 크게 보기" className="absolute bottom-0 left-1/2 block -translate-x-1/2" style={{ width: stageW }}>
      <Eclipse guide={false} max={2} poster>
        <span className="flex size-14 items-center justify-center text-white/90">
          <IconQr className="size-8" />
        </span>
      </Eclipse>
    </Link>
  );
}

function Classic({ w, h }: { w: number; h: number }) {
  const s = Math.max(0.55, Math.min(1.4, w / 300, h / 250));
  return (
    <Link href="/card/qr" aria-label="내 명함 QR 크게 보기" className="absolute block size-[232px] origin-bottom-right" style={{ right: 10 * s, bottom: 6 * s, transform: `scale(${s})` }}>
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
  );
}
