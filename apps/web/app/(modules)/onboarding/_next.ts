// 로그인 없이 명함 QR(/card?p=) · 포스터 QR(/poster?c=) 로 들어온 사람을 온보딩 뒤 제자리로 돌려보낼 때 쓰는 next 검사.
// 같은 사이트 경로(/ 로 시작, // 는 제외)만 허용한다. 온보딩 진입 · 동의 화면이 같이 쓴다.
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// next 가 있으면 경로에 붙여 준다
export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
