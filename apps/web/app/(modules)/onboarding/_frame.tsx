// 온보딩 화면 공통 틀(피그마 iPhone 16 - 4 · 5 · 6 · 11). 위쪽 남색 물결, 맨 위 행사 이름, 아래 단계 점과 이전 · 다음.
// 좌표는 피그마 프레임(393 폭) 그대로 쓰고 가운데 정렬한다.
import Link from "next/link";
import { IconChevron } from "@/components/figma/Icons";

const WAVES = {
  login: { src: "/figma/wave-login.svg", left: -35, top: -57, w: 1341 },
  consent: { src: "/figma/wave-consent.svg", left: -222.31, top: -43.18, w: 1116 },
  seat: { src: "/figma/wave-login.svg", left: -801, top: -57, w: 1341 },
} as const;

export default function OnboardingFrame({
  wave,
  step,
  back,
  next,
  children,
}: {
  wave: keyof typeof WAVES;
  step: 0 | 1 | 2;
  back?: string;
  next: { label: string; onClick?: () => void; disabled?: boolean; type?: "submit" | "button"; form?: string };
  children: React.ReactNode;
}) {
  const w = WAVES[wave];
  return (
    <div className="flex min-h-screen justify-center overflow-clip bg-white text-black">
      <div className="relative min-h-[max(100dvh,740px)] w-full max-w-[393px] overflow-clip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={w.src} className="pointer-events-none absolute h-[483px] max-w-none" style={{ left: w.left, top: w.top, width: w.w }} />
        <p className="absolute inset-x-0 top-[55px] text-center text-base leading-[25px] text-white">2026 DSL Gathering Night: The ORBIT</p>
        {children}
        <footer className="absolute inset-x-0 bottom-[25px] flex h-6 items-center px-[34px]">
          {back ? (
            <Link href={back} aria-label="이전" className="flex size-6 items-center">
              <IconChevron />
            </Link>
          ) : (
            <span className="size-6" />
          )}
          <span className="flex flex-1 items-center justify-center gap-[7px]" aria-label={`${step + 1} / 3 단계`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-2 rounded-full bg-line ${i === step ? "w-10" : "w-2"}`} />
            ))}
          </span>
          <button type={next.type ?? "button"} form={next.form} onClick={next.onClick} disabled={next.disabled} className="text-[13px] text-black disabled:text-line">
            {next.label}
          </button>
        </footer>
      </div>
    </div>
  );
}
