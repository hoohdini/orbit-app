// 포스터 응답 (담당: 민찬). /poster?c=<code> 는 포스터 QR 을 찍었을 때 열리는 관심 이유 → (선택) 퀴즈 화면이다.
// 앱 스캐너와 폰 기본 카메라 모두 /poster?c= 로 들어온다(docs/QR_FORMAT.md). 코드 없이 들어오면 이벤트 탭 미션 현황판(/event)으로 보낸다(v0.2 E-01).
import { redirect } from "next/navigation";
import { requireOnboarded } from "./_guard";
import PosterClient from "./PosterClient";

export const dynamic = "force-dynamic";

export default async function PosterPage({ searchParams }: { searchParams: Promise<{ c?: string; via?: string }> }) {
  const { c, via } = await searchParams;
  if (!c) redirect("/event");
  await requireOnboarded(`/poster?c=${encodeURIComponent(c)}`);
  return <PosterClient key={c} code={c} via={via === "card" || via === "event" ? via : null} />;
}
