// 마이페이지 탭 첫 화면(피그마 마이페이지 탭). 행사 이름, 내 명함 미리보기, 내 계정 메뉴(명함 편집 · 내 정보).
import MyShell from "./MyShell";
import MyHome from "./MyHome";

export const dynamic = "force-dynamic";

export default function MyPage() {
  return (
    <MyShell>
      <MyHome />
    </MyShell>
  );
}
