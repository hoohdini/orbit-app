// 명함 모듈 라우트 보호. /card?p= 로 들어온 사람은 온보딩 뒤 제자리로 돌아와야 해서
// layout 이 아니라 page 마다 next 를 넘겨 부른다(layout 은 검색 파라미터를 모른다).
// v0.2 H-00: 동의를 거부한 사람도 들어온다(components/enterGuard.ts). 교환 · 추천은 API 가 막는다.
import "server-only";
import { requireEntered } from "@/components/enterGuard";

export async function requireOnboarded(next: string): Promise<string> {
  return (await requireEntered(next)).id as string;
}
