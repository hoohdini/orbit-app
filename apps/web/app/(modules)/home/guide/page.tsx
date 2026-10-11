// 사용설명서는 마이페이지(/my/guide)로 옮겼다(10/11 피그마). 예전 주소는 그리로 보낸다.
import { redirect } from "next/navigation";

export default function GuidePage() {
  redirect("/my/guide");
}
