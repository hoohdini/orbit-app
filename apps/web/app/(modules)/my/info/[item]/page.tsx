// 동의 항목 상세(피그마 마이페이지 -명함공개 · 개인정보 수집 및 활용). 본문과 동의함 · 동의하지 않음
import { notFound } from "next/navigation";
import MyShell from "../../MyShell";
import ConsentItem from "./ConsentItem";

export const dynamic = "force-dynamic";

const TITLE = { collect: "개인정보 수집 및 이용", share: "명함 공개 및 추천 활용" } as const;

export default async function ConsentItemPage({ params }: { params: Promise<{ item: string }> }) {
  const { item } = await params;
  if (item !== "collect" && item !== "share") notFound();
  return (
    <MyShell title={TITLE[item]} back="/my/info">
      <ConsentItem item={item} />
    </MyShell>
  );
}
