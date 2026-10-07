// 포스터 모듈 라우트 보호. card/_guard.ts 와 같은 규칙이다.
// 폰 기본 카메라로 포스터 QR(/poster?c=)을 찍고 들어온 사람은 온보딩 뒤 그 포스터로 돌아와야 해서 page 에서 next 를 넘겨 부른다.
import "server-only";
import { requireEntered } from "@/components/enterGuard";

export async function requireOnboarded(next: string): Promise<string> {
  return (await requireEntered(next)).id as string;
}
