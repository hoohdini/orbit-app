// 내 정보(피그마 마이페이지 -내정보). 개인정보 동의 두 항목, 도움말(사용설명서), 로그아웃.
import MyShell from "../MyShell";
import Info from "./Info";

export const dynamic = "force-dynamic";

export default function InfoPage() {
  return (
    <MyShell title="내 정보">
      <Info />
    </MyShell>
  );
}
