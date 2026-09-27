// 포스터세션 스탬프 투어 (담당: 민찬). /poster 는 스탬프판, /poster?c=<code> 는 포스터 QR 을 찍었을 때 열리는 퀴즈다.
// 앱 스캐너(명함 스캔 화면 · 이 화면)와 폰 기본 카메라 모두 /poster?c= 로 들어온다(docs/QR_FORMAT.md).
import { requireOnboarded } from "./_guard";
import PosterClient from "./PosterClient";

export const dynamic = "force-dynamic";

export default async function PosterPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  await requireOnboarded(c ? `/poster?c=${encodeURIComponent(c)}` : "/poster");
  return <PosterClient key={c ?? "board"} code={c ?? null} />;
}
