// v0.2 결정 1: 테이블토크 · 커피챗은 네트워킹 탭(/networking)으로 합쳤다. 예전 주소 · 북마크용으로 그쪽에 보낸다.
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/networking");
}
