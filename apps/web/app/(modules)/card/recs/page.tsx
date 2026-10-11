// 오늘 만나면 좋을 분(피그마 iPhone 16 - 12, v0.2 H-04). 행사 전에 정한 10명을 가까운 순서 번호로 보여 준다(10/11).
import SubHeader from "@/components/figma/SubHeader";
import { requireOnboarded } from "../_guard";
import CardShell from "../CardShell";
import RecsList from "./RecsList";

export const dynamic = "force-dynamic";

export default async function RecsPage() {
  await requireOnboarded("/card/recs");
  return (
    <CardShell header={<SubHeader title="오늘 만나면 좋을 분" back="/card" />}>
      <RecsList />
    </CardShell>
  );
}
