// 피그마 Stamp(DSL 로고 스탬프). on = 획득(남색 테두리 원), off = 미획득(점선 원 + 흐린 로고)
/* eslint-disable @next/next/no-img-element */
export default function Stamp({ on, size = 36 }: { on: boolean; size?: number }) {
  if (on) return <img alt="획득한 스탬프" src="/figma/stamp-on.svg" width={size} height={size} className="shrink-0" />;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-label="아직 받지 않은 스탬프">
      <img alt="" src="/figma/stamp-off-lg.png" className="absolute inset-0 size-full" />
      <img alt="" src="/figma/stamp-logo.svg" className="absolute" style={{ left: "18.06%", right: "18.06%", top: "33.19%", bottom: "30.41%", width: "63.88%", height: "36.4%" }} />
    </span>
  );
}
