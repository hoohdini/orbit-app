// 교환한 명함 목록 · 상세가 같이 쓰는 표시 문구
import type { Card, MetAt } from "@/app/api/card/_lib";

export const roleLabel: Record<string, string> = { student: "재학생", alumni: "졸업생", professor: "교수", staff: "운영진", other: "참가자" };

export const FILTERS: { key: MetAt | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "table", label: "테이블" },
  { key: "poster", label: "포스터" },
  { key: "coffeechat", label: "커피챗" },
];

// 카드 왼쪽 위 어디서 만났나. 같은 테이블 · 그룹이었으면 번호를 붙인다
export function metLabel(c: Card): string {
  if (c.status === "pending") return "확인 대기";
  const t = c.together;
  if (c.met === "table") return t?.table_no ? `테이블 · ${t.table_no}번` : "테이블토크";
  if (c.met === "poster") return "포스터 세션";
  if (c.met === "coffeechat") return t?.group_no ? `커피챗 · 그룹 ${t.group_no}` : "커피챗";
  return "행사장";
}

export function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function whoLine(c: Card): string {
  return [c.cohort ? `${c.cohort}기` : null, roleLabel[c.role] ?? null].filter(Boolean).join(" · ");
}

export function fieldLine(c: Card): string {
  return c.topic_tags.slice(0, 2).join(" · ") || c.label || c.affiliation || "";
}
