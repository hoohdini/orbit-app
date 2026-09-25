// 사용설명서. 본문은 운영진에게 받아 채운다. 지금은 구조만 있다.
import TopBar from "@/components/TopBar";

const sections = [
  { title: "이 앱은 무엇인가", body: "행사 참가자끼리 만남을 돕는 웹앱이다. 테이블 배정, 명함 교환, 포스터 스탬프, 커피챗 추천을 한 곳에서 본다." },
  { title: "내 주소(SID)", body: "관심사와 하는 일을 숫자 세 자리 주소로 나타낸 것이다. 앞자리가 같을수록 비슷한 사람이다. 명함에도 같은 자리에 찍힌다." },
  { title: "궤도", body: "나를 중심에 두고, 앞 3자리·2자리·1자리가 같은 사람을 안쪽부터 바깥쪽 링에 놓는다. 지금 입장한 사람만 보이고 15초마다 갱신된다." },
  { title: "테이블토크", body: "안내된 테이블에 앉아 같은 테이블 사람들과 이야기한다. 끝날 때 짧은 만족도 질문이 뜬다." },
  { title: "명함", body: "내 명함의 QR 을 상대가 찍으면 명함이 교환된다. 카메라 권한이 없으면 이름으로 찾을 수 있다." },
  { title: "포스터 스탬프", body: "포스터의 QR 을 찍고 퀴즈를 맞히면 스탬프를 받는다. 스탬프를 모으면 응모권이 나온다." },
  { title: "커피챗", body: "테이블토크와 명함 교환 기록으로 새 테이블을 배정하고, 만나면 좋을 사람을 추천한다. 시간 안에 자유롭게 옮겨 다닌다." },
  { title: "개인정보", body: "이름, 소속, 관심 태그, 한 줄 소개, 앱 사용 기록을 행사 운영에만 쓰고 행사 뒤 30일에 지운다." },
];

export default function GuidePage() {
  return (
    <>
      <TopBar title="사용설명서" right={[{ href: "/home", label: "홈" }]} />
      <main className="space-y-3 p-4">
        {sections.map((s) => (
          <section key={s.title} className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-gray-700">{s.body}</p>
          </section>
        ))}
        <p className="pt-2 text-xs text-gray-400">본문은 운영진 확정 문구로 바뀐다.</p>
      </main>
    </>
  );
}
