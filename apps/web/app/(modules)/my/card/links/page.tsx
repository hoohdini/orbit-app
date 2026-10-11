// 연락처 링크 편집(피그마에는 없음. 명함 상세의 연락처가 여기서 정해진다)
import MyShell from "../../MyShell";
import LinksEdit from "./LinksEdit";

export const dynamic = "force-dynamic";

export default function LinksPage() {
  return (
    <MyShell title="연락처" back="/my/card">
      <LinksEdit />
    </MyShell>
  );
}
