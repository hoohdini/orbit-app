// 포스터 (담당: 민찬, 화면 10/11 피그마). /poster?c=<code> 는 포스터 QR 을 찍었을 때(앱 스캐너 · 폰 기본 카메라 모두, docs/QR_FORMAT.md),
// /poster?id=<poster_id> 는 포스터 세션 목록에서 이미 찍은 포스터를 다시 열 때(피그마 A31). 둘 다 없으면 이벤트 탭으로 보낸다.
import { redirect } from "next/navigation";
import { requireOnboarded } from "./_guard";
import PosterClient from "./PosterClient";

export const dynamic = "force-dynamic";

export default async function PosterPage({ searchParams }: { searchParams: Promise<{ c?: string; id?: string; via?: string }> }) {
  const { c, id, via } = await searchParams;
  if (!c && !id) redirect("/event");
  await requireOnboarded(c ? `/poster?c=${encodeURIComponent(c)}` : `/poster?id=${encodeURIComponent(id!)}`);
  return <PosterClient key={c ?? `id-${id}`} code={c ?? null} id={id ? Number(id) : null} via={via === "card" || via === "event" ? via : null} />;
}
