// 네트워킹 미션 상세(피그마 E-03 추천 인물 · E-04 새로운 연결 · E-05 세대 연결).
import { notFound } from "next/navigation";
import EventShell from "../../EventShell";
import MissionDetail from "./MissionDetail";

export const dynamic = "force-dynamic";

const TITLE: Record<string, string> = { recommended: "추천 인물 만나기", first_meet: "새로운 연결", generation: "세대 연결" };

export default async function MissionPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!TITLE[key]) notFound();
  return (
    <EventShell title={TITLE[key]}>
      <MissionDetail mkey={key as "recommended" | "first_meet" | "generation"} />
    </EventShell>
  );
}
