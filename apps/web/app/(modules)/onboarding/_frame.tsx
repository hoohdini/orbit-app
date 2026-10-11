"use client";
// 온보딩 화면 공통 틀(피그마 iPhone 16 - 4 · 5 · 6 · 11). 위쪽 남색 물결과 행사 이름, 아래 단계 점과 큰 버튼.
// 10/11 검토: 진행 버튼을 오른쪽 아래 13px 글자(Next)에서 화면 아래 큰 버튼(높이 56)으로 바꾸고 이전은 옆 네모 버튼으로 뒀다.
// 위쪽 장식(stage)은 피그마 393 폭 좌표를 화면 폭에 맞춰 비율로 늘리고 줄인다(useFit). 입력 · 본문은 그 아래 보통 흐름으로 놓아 높이가 달라도 넘치지 않는다
import Link from "next/link";
import { useFit } from "@/components/figma/useFit";
import { IconChevron } from "@/components/figma/Icons";

const WAVES = {
  login: { src: "/figma/wave-login.svg", left: -35, top: -57, w: 1341 },
  consent: { src: "/figma/wave-consent.svg", left: -222.31, top: -43.18, w: 1116 },
  seat: { src: "/figma/wave-login.svg", left: -801, top: -57, w: 1341 },
} as const;

export default function OnboardingFrame({
  wave,
  step,
  stageH,
  stage,
  back,
  next,
  children,
}: {
  wave: keyof typeof WAVES;
  step: 0 | 1 | 2;
  stageH: number; // 위쪽 장식 무대 높이(피그마 좌표)
  stage?: React.ReactNode; // 무대 안에 393 좌표로 그릴 것(제목 · 로고 등)
  back?: string;
  next: { label: string; onClick?: () => void; disabled?: boolean; type?: "submit" | "button"; form?: string };
  children?: React.ReactNode;
}) {
  const w = WAVES[wave];
  const [ref, s] = useFit<HTMLDivElement>(393, 1.15);
  return (
    <div className="flex min-h-dvh justify-center overflow-clip bg-white text-ink">
      <div ref={ref} className="relative flex w-full max-w-md flex-col">
        <div className="relative w-full shrink-0" style={{ height: stageH * s }}>
          <div className="absolute left-1/2 top-0 w-[393px] origin-top" style={{ height: stageH, transform: `translateX(-50%) scale(${s})` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={w.src} className="pointer-events-none absolute h-[483px] max-w-none" style={{ left: w.left, top: w.top, width: w.w }} />
            <p className="absolute inset-x-0 top-[55px] text-center text-base leading-[25px] text-white">2026 DSL Gathering Night: The ORBIT</p>
            {stage}
          </div>
        </div>
        <div className="relative z-10 flex flex-1 flex-col px-6">{children}</div>
        <footer className="sticky bottom-0 z-10 bg-white/95 px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] backdrop-blur">
          <span className="mb-3 flex items-center justify-center gap-[7px]" aria-label={`${step + 1} / 3 단계`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-2 rounded-full ${i === step ? "w-10 bg-navy" : "w-2 bg-[#a6abb3]"}`} />
            ))}
          </span>
          <div className="flex gap-2">
            {back && (
              <Link href={back} aria-label="이전" className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-navy text-navy">
                <IconChevron />
              </Link>
            )}
            <button type={next.type ?? "button"} form={next.form} onClick={next.onClick} disabled={next.disabled} className="h-14 flex-1 rounded-2xl bg-navy text-base font-bold text-white disabled:bg-field disabled:text-ink-3">
              {next.label}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
