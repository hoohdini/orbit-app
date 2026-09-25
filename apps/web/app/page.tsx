// 루트. 로그인돼 있으면 홈, 아니면 온보딩으로 보낸다. 개발용 모듈 목록은 /dev 에 있다.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Index() {
  const s = await getSession();
  redirect(s ? "/home" : "/onboarding");
}
