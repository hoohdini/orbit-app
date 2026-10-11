// 피그마 Eclipse Viewfinder(내 명함 QR · QR 스캔 화면). 393×420 무대 위에 코로나 빛, 플레어, 별, 가운데 원(280)을 그린다.
// children 은 가운데 원 안에 들어간다(카메라 화면 또는 QR). 장식 이미지는 public/figma 에 받아 둔 피그마 원본이다.
const STARS = [
  { src: "/figma/vf-star1.svg", l: 70, t: 60, s: 7 },
  { src: "/figma/vf-star2.svg", l: 300, t: 22, s: 6 },
  { src: "/figma/vf-star3.svg", l: 352, t: 150, s: 5 },
  { src: "/figma/vf-star4.svg", l: 330, t: 248, s: 9 },
  { src: "/figma/vf-star5.svg", l: 150, t: 372, s: 8 },
  { src: "/figma/vf-star6.svg", l: 128, t: 340, s: 4 },
];

export default function Eclipse({ children, variant = "scan", guide = true }: { children?: React.ReactNode; variant?: "scan" | "qr"; guide?: boolean }) {
  return (
    <div className="relative mx-auto h-[420px] w-[393px] shrink-0">
      {/* eslint-disable @next/next/no-img-element */}
      <img alt="" src="/figma/vf-corona.svg" className="absolute left-[4.5px] top-[18px] size-[384px] max-w-none" />
      <div className="absolute left-[-16.39px] top-[39.68px] flex h-[340.632px] w-[425.773px] items-center justify-center">
        <img alt="" src={variant === "qr" ? "/figma/vf-flare-wide-qr.svg" : "/figma/vf-flare-wide.svg"} className="h-[58px] w-[552px] max-w-none -rotate-[38deg]" />
      </div>
      <div className="absolute left-[9.47px] top-[62.96px] flex h-[294.089px] w-[374.059px] items-center justify-center">
        <img alt="" src="/figma/vf-flare-core.svg" className="h-[14px] w-[478px] max-w-none -rotate-[38deg]" />
      </div>
      {STARS.map((s) => (
        <img key={s.src} alt="" src={s.src} className="absolute max-w-none" style={{ left: s.l - s.s * 2, top: s.t - s.s * 2, width: s.s * 5, height: s.s * 5 }} />
      ))}
      <img alt="" src="/figma/vf-camera.svg" className="absolute left-[26.5px] top-[40px] size-[340px] max-w-none" />
      <div className="absolute left-[56.5px] top-[70px] flex size-[280px] items-center justify-center overflow-hidden rounded-full">{children}</div>
      {guide && <img alt="" src={variant === "qr" ? "/figma/vf-guide-qr.svg" : "/figma/vf-guide.svg"} className="pointer-events-none absolute left-[108.5px] top-[122px] size-[176px] max-w-none" />}
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}
