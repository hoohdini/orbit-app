// 관심 태그 규칙(마이페이지 Offer · Seek 수정, 10/11 피그마). 화면과 API 가 같은 상한을 쓴다
export const TAG_MAX = 5;
export const TAG_LEN = 20;
export const TEXT_MAX = 80;

export function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.replace(/^#/, "").trim().slice(0, TAG_LEN);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, TAG_MAX);
}
