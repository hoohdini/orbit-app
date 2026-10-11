// 내 명함 QR 크게 보기(피그마 iPhone 16 - 13, 홈 화면의 원을 누르면 열림).
import { requireOnboarded } from "../_guard";
import MyQr from "./MyQr";

export const dynamic = "force-dynamic";

export default async function QrPage() {
  await requireOnboarded("/card/qr");
  return <MyQr />;
}
