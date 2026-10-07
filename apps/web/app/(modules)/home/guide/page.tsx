// 사용설명서. 본문은 운영진에게 받아 채운다. 지금은 구조만 있다.
import TopBar from "@/components/TopBar";

const sections = [
  { title: "이 앱은 무엇인가", body: "행사 참가자끼리 만남을 돕는 웹앱이다. 아래 네 탭으로 쓴다. 맨 위 띠에 지금 순서와 내 자리, 운영진 공지가 뜬다." },
  { title: "명함 탭", body: "앱을 열면 보이는 첫 화면이다. 내 명함을 누르면 QR 이 크게 뜬다. 스캔하기로 상대 명찰 QR 을 찍으면 서로 명함을 주고받는다. 오늘 만나면 좋을 분 3명이 뜨고, 교환하면 다음 분으로 바뀐다. 세션 중에는 접힌다." },
  { title: "네트워킹 탭", body: "테이블토크 자리와 커피챗 그룹을 보여 준다. 가운데 나, 둘레에 같은 테이블 사람, 아래에 행사장 테이블 배치가 있다. 새 배정이 나오면 확인 카드가 먼저 뜬다." },
  { title: "이벤트 탭", body: "미션 네 개(관심 포스터 2곳, 추천 인물 만나기, 처음 대화한 분 2명, 세대가 다른 분 1명)를 모은다. 포스터를 빼면 명함 교환으로 저절로 채워진다. 미션은 특별 시상에 쓴다. 응모권은 명찰 번호로 모두에게 준다." },
  { title: "마이페이지", body: "명함 링크와 공개 범위를 고치고, 이용 동의를 바꾸고, 로그아웃한다." },
  { title: "개인정보", body: "사전 등록 정보와 행사 중 앱 사용 기록을 행사 운영에만 쓰고 행사 뒤 30일에 지운다. 동의하지 않아도 자리 안내와 식순은 볼 수 있다." },
];

export default function GuidePage() {
  return (
    <>
      <TopBar title="사용설명서" right={[{ href: "/my", label: "마이페이지" }]} />
      <main className="space-y-3 p-4">
        {sections.map((s) => (
          <section key={s.title} className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-gray-700">{s.body}</p>
          </section>
        ))}
        <p className="pt-2 text-xs text-gray-400">본문은 운영진 확정 문구로 바뀐다.</p>
        <a href="/logout" className="block rounded-xl border border-gray-300 bg-white py-2 text-center text-sm text-gray-600">
          로그아웃 (다른 사람이 이 폰으로 로그인할 때)
        </a>
      </main>
    </>
  );
}
