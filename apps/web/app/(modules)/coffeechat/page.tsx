// 커피챗 (담당: 민찬). 9/27 회의로 테이블토크와 한 페이지가 됐다. 예전 주소로 들어오면 /tabletalk 로 보낸다.
import { redirect } from "next/navigation";

export default function CoffeechatPage() {
  redirect("/tabletalk");
}
