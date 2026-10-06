// 화면에 짧게 보여 줄 문장 고르기. 서버 · 화면 어디서나 쓴다(모듈끼리 import 하지 않으려고 lib 에 둔다).

// 소개 문장의 첫 문장. 줄바꿈이나 마침표 · 물음표 · 느낌표 뒤에서 자른다. 개발 지시서 v0.2 의 '이력 한 줄'(Offer 첫 문장)
// 영문 약어(Ph.D. · U.S.)에서 끊지 않으려고 마침표 바로 앞이 영문자이면 문장 끝으로 보지 않는다
export function firstSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const line = t.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  const m = line.match(/^.*?[^A-Za-z][.!?。](?=\s|$)/);
  return (m ? m[0] : line).trim();
}
