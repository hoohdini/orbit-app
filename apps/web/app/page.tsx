import Link from "next/link";

const modules = [
  ["/onboarding", "온보딩", "성하"],
  ["/home", "홈", "성하"],
  ["/card", "명함", "성하"],
  ["/tabletalk", "테이블토크", "민찬"],
  ["/coffeechat", "커피챗", "민찬"],
  ["/poster", "포스터세션", "민찬"],
] as const;

export default function Index() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-bold">orbit-app 모듈 목록</h1>
      <p className="mt-2 text-gray-600">개발용 진입 화면이다. 배포 전에 온보딩으로 바꾼다.</p>
      <ul className="mt-6 space-y-2">
        {modules.map(([href, name, owner]) => (
          <li key={href}>
            <Link className="underline" href={href}>{name}</Link>
            <span className="ml-2 text-sm text-gray-400">{owner}</span>
          </li>
        ))}
        <li><a className="underline" href="/api/health">/api/health</a></li>
      </ul>
    </main>
  );
}
