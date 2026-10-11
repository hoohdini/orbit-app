// 명함 편집(피그마 마이페이지-명함편집 · 내가찍은사람만).
import MyShell from "../MyShell";
import CardEdit from "./CardEdit";

export const dynamic = "force-dynamic";

export default function CardEditPage() {
  return (
    <MyShell title="명함 편집">
      <CardEdit />
    </MyShell>
  );
}
