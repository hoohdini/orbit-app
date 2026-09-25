// 개발용 진입 화면. 모듈 목록과 시드 로그인 정보. 배포에서는 링크를 걸지 않는다.
import Link from "next/link";

const modules = [
  ["/onboarding", "온보딩", "성하"],
  ["/home", "홈", "성하"],
  ["/card", "명함", "성하"],
  ["/tabletalk", "테이블토크", "민찬"],
  ["/coffeechat", "커피챗", "민찬"],
  ["/poster", "포스터세션", "민찬"],
  ["/ops", "운영 콘솔", "성하"],
] as const;

export default function DevIndex() {
  return (
    <main className="mx-auto min-h-screen max-w-md p-6">
      <h1 className="text-2xl font-bold">orbit-app 모듈 목록 (개발용)</h1>
      <ul className="mt-6 space-y-2">
        {modules.map(([href, name, owner]) => (
          <li key={href}>
            <Link className="underline" href={href}>
              {name}
            </Link>
            <span className="ml-2 text-sm text-gray-400">{owner}</span>
          </li>
        ))}
        <li>
          <a className="underline" href="/api/health">
            /api/health
          </a>
        </li>
      </ul>
      <p className="mt-8 text-sm text-gray-500">시드 로그인: 학생 A 0000, 테스트 운영자 0000, 김민수 1111 또는 2222. 목록은 supabase/seed*.sql.</p>
    </main>
  );
}
