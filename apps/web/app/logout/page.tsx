// /logout  주소로 들어오면 세션 쿠키를 지우고 온보딩으로 보낸다. 같은 폰으로 다른 사람이 로그인할 때(운영자 테스트, 공용 폰) 쓴다.
// 로그아웃 API 는 POST 라 주소창으로 부를 수 없어서 이 페이지가 대신 부른다.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Loading from "@/components/Loading";

export default function LogoutPage() {
  const router = useRouter();
  useEffect(() => {
    api("/api/onboarding/logout", { method: "POST" }).finally(() => router.replace("/onboarding"));
  }, [router]);
  return <Loading text="로그아웃 중" />;
}
