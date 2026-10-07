// 공용 QR 스캔 화면(v0.2 H-05). 카메라 + 이름 검색(대체 경로). ?via=event 면 이벤트 탭에서 연 것이다.
import { requireOnboarded } from "../_guard";
import ScanClient from "./ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ via?: string }> }) {
  const { via } = await searchParams;
  await requireOnboarded("/card/scan");
  return <ScanClient via={via === "event" ? "event" : "card"} />;
}
