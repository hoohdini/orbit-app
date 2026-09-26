// 명찰 QR 스캔 화면. 카메라 + 이름 검색(대체 경로).
import { requireOnboarded } from "../_guard";
import ScanClient from "./ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireOnboarded("/card/scan");
  return <ScanClient />;
}
