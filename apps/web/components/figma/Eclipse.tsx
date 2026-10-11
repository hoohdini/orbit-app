"use client";
// 피그마 Eclipse Viewfinder(내 명함 QR · QR 스캔 화면). 393×420 무대 위에 코로나 빛, 플레어, 별, 가운데 원(280)을 그린다.
// children 은 가운데 원 안에 들어간다(카메라 화면 또는 QR). 장식 이미지는 public/figma 에 받아 둔 피그마 원본이다.
// 무대는 화면 폭에 맞춰 비율로 줄이고 늘린다(useFit). 원 안 내용(카메라 · QR)은 크기를 그대로 두고 원만 따라 커진다
import { useFit } from "./useFit";

const STARS = [
  { src: "/figma/vf-star1.svg", l: 70, t: 60, s: 7 },
  { src: "/figma/vf-star2.svg", l: 300, t: 22, s: 6 },
  { src: "/figma/vf-star3.svg", l: 352, t: 150, s: 5 },
  { src: "/figma/vf-star4.svg", l: 330, t: 248, s: 9 },
  { src: "/figma/vf-star5.svg", l: 150, t: 372, s: 8 },
  { src: "/figma/vf-star6.svg", l: 128, t: 340, s: 4 },
];

// poster 를 켜면 행사 포스터처럼 테두리 하얀 광채, 오른쪽 위 테두리 반짝임, 별을 더한다(명함 홈, 10/11)
const POSTER_STARS = [
  { l: 30, t: 120, s: 3 },
  { l: 362, t: 92, s: 4 },
  { l: 46, t: 300, s: 5 },
  { l: 250, t: 398, s: 3 },
  { l: 372, t: 330, s: 3 },
  { l: 200, t: 18, s: 3 },
];

export default function Eclipse({ children, variant = "scan", guide = true, max = 1.12, poster = false }: { children?: React.ReactNode; variant?: "scan" | "qr"; guide?: boolean; max?: number; poster?: boolean }) {
  const [ref, s] = useFit<HTMLDivElement>(393, max);
  return (
    <div ref={ref} className="relative w-full" style={{ height: 420 * s }}>
      <div className="absolute left-1/2 top-0 h-[420px] w-[393px] origin-top" style={{ transform: `translateX(-50%) scale(${s})` }}>
        {/* eslint-disable @next/next/no-img-element */}
        <img alt="" src="/figma/vf-corona.svg" className="absolute left-[4.5px] top-[18px] size-[384px] max-w-none" />
        <div className="absolute left-[-16.39px] top-[39.68px] flex h-[340.632px] w-[425.773px] items-center justify-center">
          <img alt="" src={variant === "qr" ? "/figma/vf-flare-wide-qr.svg" : "/figma/vf-flare-wide.svg"} className="h-[58px] w-[552px] max-w-none -rotate-[38deg]" />
        </div>
        <div className="absolute left-[9.47px] top-[62.96px] flex h-[294.089px] w-[374.059px] items-center justify-center">
          <img alt="" src="/figma/vf-flare-core.svg" className="h-[14px] w-[478px] max-w-none -rotate-[38deg]" />
        </div>
        {STARS.map((st) => (
          <img key={st.src} alt="" src={st.src} className="absolute max-w-none" style={{ left: st.l - st.s * 2, top: st.t - st.s * 2, width: st.s * 5, height: st.s * 5 }} />
        ))}
        <img alt="" src="/figma/vf-camera.svg" className="absolute left-[26.5px] top-[40px] size-[340px] max-w-none" />
        {poster && (
          <>
            {POSTER_STARS.map((st, i) => (
              <span key={i} className="absolute rounded-full bg-[#8fd0ff]" style={{ left: st.l, top: st.t, width: st.s, height: st.s, boxShadow: `0 0 ${st.s * 3}px ${st.s}px rgba(80,170,255,0.7)` }} />
            ))}
            {/* 테두리 하얀 광채 */}
            <span className="absolute left-[56.5px] top-[70px] size-[280px] rounded-full" style={{ boxShadow: "0 0 10px 3px rgba(235,248,255,0.95), 0 0 34px 12px rgba(120,200,255,0.75), 0 0 80px 30px rgba(47,139,234,0.45)" }} />
          </>
        )}
        <div className="absolute left-[56.5px] top-[70px] flex size-[280px] items-center justify-center overflow-hidden rounded-full">{children}</div>
        {poster && (
          // 오른쪽 위 테두리의 반짝임(다이아몬드 링). 플레어 방향(-38도)과 원이 만나는 점
          <span className="pointer-events-none absolute size-[64px] rounded-full" style={{ left: 306.8 - 32, top: 123.8 - 32, background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(190,230,255,0.85) 18%, rgba(90,170,255,0.35) 45%, rgba(47,139,234,0) 70%)" }} />
        )}
        {guide && <img alt="" src={variant === "qr" ? "/figma/vf-guide-qr.svg" : "/figma/vf-guide.svg"} className="pointer-events-none absolute left-[108.5px] top-[122px] size-[176px] max-w-none" />}
        {/* eslint-enable @next/next/no-img-element */}
      </div>
    </div>
  );
}
