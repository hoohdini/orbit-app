// Offer · Seek 수정(피그마 마이페이지-offer 수정 · seek 수정 · 태그 추가).
import { notFound } from "next/navigation";
import MyShell from "../../MyShell";
import TextEdit from "./TextEdit";

export const dynamic = "force-dynamic";

export default async function FieldPage({ params }: { params: Promise<{ field: string }> }) {
  const { field } = await params;
  if (field !== "offer" && field !== "seek") notFound();
  return (
    <MyShell title={field === "offer" ? "Offer" : "Seek"} back="/my/card">
      <TextEdit field={field} />
    </MyShell>
  );
}
