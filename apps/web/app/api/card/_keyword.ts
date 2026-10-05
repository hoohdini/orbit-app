// 키워드로 사람 찾기 순수 로직(시제품, 2026-10-05 민찬 제안. 회의에서 채택 · 담당이 정해지기 전). DB · 세션에 의존하지 않는다.
// 사전 설문에 대충 썼거나 행사 중 새로 관심이 생긴 주제로 사람을 찾는다. 이름 검색(/api/card/search)과 따로 둔다.
//
// 공개 범위(10/5 민찬 결정) — '지금 하는 일'은 전문을 보여 준다. '찾는 사람' 문장은 주지 않고 거기서 맞았다는 것만 알린다.
//   지금 명함 화면 안내는 "하는 일 · 태그는 명함을 가진 사람에게 보인다"라서, 채택되면 이용 동의(H-00) 문구와 명함 안내를 같이 고쳐야 한다
//
// 누구를 찾나 — 글자 검색: 관심 태그 · 하는 일에 검색어(또는 줄임말 사전의 같은 뜻 다른 표기)가 들어 있음(띄어쓰기 · 대소문자 · 전각 · 붙임표 무시).
//                '찾는 사람' 칸은 글자로 찾지 않는다. 결과에 그 칸이 맞았다고만 보여 줘도 두 글자씩 바꿔 넣으면 남의 '찾는 사람' 문장을
//                알아낼 수 있어서(10/5 검토). 뜻 검색도 하는 일 문장 · 관심 태그만 쓴다
//              뜻 검색: 계산 서비스 /search 가 돌려준, 하는 일 뜻이 가까운 사람(0.5초 안에 답이 없으면 글자 검색만).
//                글자로 맞은 사람이 있으면, 뜻으로만 찾은 사람은 글자로 맞은 사람 중 가장 낮은 뜻 점수 이상이어야 넣는다
//                (검색어 그대로 맞은 사람이 있으면 그 사람들 기준. 사전 표기로만 맞은 사람은 뜻 점수가 낮을 수 있어서)
// 순서 — 우리 추천 점수(상호 점수, _vec.ts) 높은 순(10/5 민찬 결정: 단어가 얼마나 똑같은지보다 나와 잘 맞는 사람이 먼저).
//   벡터가 없는 사람(주소 발급 전 현장 등록자)은 뒤로, 그 안에서는 맞은 칸(태그 → 하는 일 → 뜻) 순, 같으면 보는 사람마다 다른 고정 순서.
//   최근 명함을 많이 받은 사람을 뒤로 보내는 규칙(v0.2 H-04)은 근거가 없고 검색은 본인이 고른 주제라 넣지 않았다(10/5 민찬 의견)

import aliasDict from "./_aliases.json";

export type KeywordPerson = {
  id: string;
  display_name: string;
  affiliation: string | null;
  cohort: number | null;
  topic_tags: string[];
  offer_text: string;
  seek_text: string;
};

export type MatchField = "관심 태그" | "하는 일" | "뜻이 가까움";
export type KeywordHit = { person: KeywordPerson; tier: number; fields: MatchField[]; tags: string[]; score?: number };

// 뜻 검색으로만 찾은 사람(글자는 안 맞음)
export function semanticHit(p: KeywordPerson): KeywordHit {
  return { person: p, tier: 4, fields: ["뜻이 가까움"], tags: [] };
}

export const KEYWORD_LIMIT = 20;
export const MIN_QUERY = 2; // 한 글자는 거의 모든 사람에 걸려 훑어보기가 된다

export function norm(s: string): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/[\s\-_·]+/g, "");
}

// terms = expandQuery(q).terms(검색어와 같은 뜻 다른 표기, norm 한 것). 주지 않으면 검색어 하나만
export function matchPerson(p: KeywordPerson, q: string, terms?: string[]): KeywordHit | null {
  const nq = norm(q);
  if (nq.length < MIN_QUERY) return null;
  const ts = terms && terms.length ? terms : [nq];
  const fields: MatchField[] = [];
  const tags: string[] = [];
  let tier = 99;
  for (const t of p.topic_tags ?? []) {
    const nt = norm(t);
    if (ts.includes(nt)) tier = Math.min(tier, 0);
    else if (ts.some((x) => containsTerm(t, x))) tier = Math.min(tier, 1);
    else continue;
    tags.push(t);
  }
  if (tags.length) fields.push("관심 태그");
  if (ts.some((x) => containsTerm(p.offer_text, x))) {
    tier = Math.min(tier, 2);
    fields.push("하는 일");
  }
  return tier === 99 ? null : { person: p, tier, fields, tags };
}

// 보는 사람마다 다른, 그러나 다시 불러도 같은 순서. FNV-1a 뒤에 섞기 한 번(murmur3 fmix32)으로 치우침을 줄인다
function mix(viewer: string, id: string): number {
  let h = 2166136261;
  for (const ch of viewer + "|" + id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function rankHits(hits: KeywordHit[], viewer: string): KeywordHit[] {
  const has = (h: KeywordHit) => (h.score === undefined ? 1 : 0);
  return [...hits].sort(
    (x, y) =>
      has(x) - has(y) ||
      (y.score ?? 0) - (x.score ?? 0) ||
      x.tier - y.tier ||
      mix(viewer, x.person.id) - mix(viewer, y.person.id)
  );
}

// 관심 태그와 사람 수. 입력 없이 눌러서 찾을 때 쓴다. 표기가 여럿이면(LLM · llm) 가장 많이 쓴 표기, 같으면 가나다순 앞의 것
export function tagCounts(people: KeywordPerson[]): { tag: string; count: number }[] {
  const byNorm = new Map<string, { ids: Set<string>; forms: Map<string, number> }>();
  for (const p of people) {
    for (const t of p.topic_tags ?? []) {
      const k = norm(t);
      if (!k) continue;
      const e = byNorm.get(k) ?? { ids: new Set<string>(), forms: new Map<string, number>() };
      e.ids.add(p.id);
      e.forms.set(t.trim(), (e.forms.get(t.trim()) ?? 0) + 1);
      byNorm.set(k, e);
    }
  }
  return [...byNorm.values()]
    .map((e) => ({
      tag: [...e.forms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0][0],
      count: e.ids.size,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ko"));
}

// ── 줄임말 사전(시제품, 2026-10-05 민찬 결정). 같은 뜻 다른 표기를 묶어 글자 검색 · 뜻 검색에 함께 쓴다. 사전 내용은 _aliases.json.
// 왜: 뜻 검색 모델(e5-small)이 '언어모델' 과 'LLM' 을 잇지 못했다(10/5 10명 시험). 검색 제품의 동의어 사전과 같은 방식이다.
// 글자 검색 — 검색어 안의 표기를 같은 묶음의 다른 표기로 바꾼 것도 찾는다('LLM 엔지니어' → '언어모델 엔지니어' 도).
// 뜻 검색   — 같은 묶음의 다른 표기를 계산 서비스 /search 에 aliases 로 보내 검색어 뒤에 붙인다.
// 3자 이하 영문 표기(ML · CV · RL)는 앞이 영문 · 숫자가 아니고 뒤가 영문이 아닐 때만 맞은 것으로 본다('html' · 'MLOps' 안의 'ml' 은 아님,
//   'GPT-4' · 'GPT4o' 는 맞음). 띄어쓰기를 지우기 전 글로 확인한다(지우면 'LLM RAG' 가 'llmrag' 로 붙어 못 찾음, 10/5 검토)

// 띄어쓰기 · 붙임표 · 밑줄 · 가운뎃점을 한 칸으로 바꾼 것. 짧은 영문 표기의 앞뒤 확인용
function spaced(s: string): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/[\s\-_·]+/g, " ");
}

type Alias = { form: string; key: string; re: RegExp | null }; // re = 짧은 영문 표기의 경계 확인
const GROUPS: Alias[][] = (aliasDict.groups as string[][]).map((g) =>
  g.map((form) => {
    const key = norm(form);
    return { form, key, re: /^[a-z0-9]{1,3}$/.test(key) ? new RegExp(`(?<![a-z0-9])${key}(?![a-z])`) : null };
  })
);
const BY_KEY = new Map(GROUPS.flat().map((a) => [a.key, a]));

function hasAlias(text: string, a: Alias): boolean {
  return a.re ? a.re.test(spaced(text)) : norm(text).includes(a.key);
}

// text(원래 글) 안에 term(norm 한 표기)이 있나. 사전의 짧은 영문 표기면 경계까지 본다
export function containsTerm(text: string, term: string): boolean {
  const a = BY_KEY.get(term);
  return a ? hasAlias(text, a) : norm(text).includes(term);
}

// 검색어 안의 from 표기를 to 표기로 바꾼 것(norm). 짧은 표기는 경계가 맞는 곳만 바꾼다
function swap(q: string, from: Alias, to: Alias): string {
  return from.re ? norm(spaced(q).replace(new RegExp(from.re.source, "g"), to.key)) : norm(q).split(from.key).join(to.key);
}

export type Expanded = { terms: string[]; aliases: string[] };

// terms = 글자 검색에 쓸 표기(norm, 원래 검색어 포함), aliases = 뜻 검색에 붙일 다른 표기(원래 모양)
export function expandQuery(q: string): Expanded {
  const terms = new Set<string>([norm(q)]);
  const aliases: string[] = [];
  for (const g of GROUPS) {
    // 묶음 안에서 검색어에 들어 있는 가장 긴 표기('대규모 언어 모델' 안의 '언어모델' 이 아니라 '대규모 언어 모델')
    const hit = g.filter((a) => hasAlias(q, a)).sort((x, y) => y.key.length - x.key.length)[0];
    if (!hit) continue;
    for (const a of g) {
      if (a === hit) continue;
      terms.add(swap(q, hit, a));
      if (!aliases.includes(a.form)) aliases.push(a.form);
    }
  }
  return { terms: [...terms], aliases };
}
