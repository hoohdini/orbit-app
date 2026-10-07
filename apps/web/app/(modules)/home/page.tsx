// v0.2 결정 1: 앱을 열면 명함 탭이다. 예전 홈 주소는 명함 탭으로 보낸다(궤도는 네트워킹 탭으로 옮겼다).
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/card");
}
