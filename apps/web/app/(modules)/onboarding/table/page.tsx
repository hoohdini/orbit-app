// v0.2 H-00: 테이블 · 좌석 안내는 첫 진입 카드(/onboarding/consent)에 합쳤다. 예전 주소는 명함 탭으로 보낸다.
import { redirect } from "next/navigation";

export default function TablePage() {
  redirect("/card");
}
