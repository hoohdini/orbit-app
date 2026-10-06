// 명함 모듈 순수 로직. DB·세션에 의존하지 않는다. 화면(card/CardView)도 이 파일의 타입과 themeOf 를 쓴다.

export const LINK_KEYS = ["linkedin", "github", "email", "url"] as const;
export type LinkKey = (typeof LINK_KEYS)[number];
export type CardLinks = Partial<Record<LinkKey, string>>;

export type CardSource = "qr" | "manual" | "auto";

// 모든 card API 응답이 같은 모양을 쓴다.
// stage 1: 명단만(이름·소속). 2: 프로필까지. 3: 주소(SID)까지 → 디자인이 정해진다
export type Card = {
  id: string;
  display_name: string;
  affiliation: string | null;
  role: string;
  cohort: number | null;
  stage: 1 | 2 | 3;
  sid: number[] | null;
  label: string | null;
  theme: number | null; // 0~7. 주소 앞자리. null 이면 회색
  offer_text: string;
  seek_text: string;
  topic_tags: string[];
  links: CardLinks | null; // 공개 범위 밖이면 null
  source?: CardSource; // 명함함·알림에서만. 내가 찍은 것(qr·manual)인지 받은 것(auto)인지
  exchanged_at?: string;
  status?: "pending" | "confirmed"; // 명함함·알림에서만. pending 은 이름 검색 교환의 상대 확인 전(v0.2 H-05-BE2)
  first_meet?: boolean | null; // 명함함에서만. 내가 고른 오늘 처음 대화한 분인가요? 의 답(null 은 아직 안 고름 · 건너뜀)
  note?: string | null; // 명함함에서만. 내가 남긴 한 줄
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// docs/QR_FORMAT.md 의 명함 QR(`https://<앱주소>/card?p=<participant_id>`) 또는 uuid 문자열을 받아 id 만 뽑는다.
export function parseCardId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (UUID.test(s)) return s.toLowerCase();
  try {
    const u = new URL(s);
    if (!u.pathname.endsWith("/card")) return null;
    const p = u.searchParams.get("p")?.trim() ?? "";
    return UUID.test(p) ? p.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function themeOf(sid: number[] | null | undefined): number | null {
  if (!sid || sid.length === 0) return null;
  return ((sid[0] % 8) + 8) % 8;
}

type ProfileLike = { offer_text?: string | null; seek_text?: string | null; topic_tags?: string[] | null; links?: CardLinks | null } | null | undefined;

export function stageOf(profile: ProfileLike, sid: number[] | null | undefined): 1 | 2 | 3 {
  if (sid && sid.length > 0) return 3;
  if (!profile) return 1;
  const filled = !!(profile.offer_text?.trim() || profile.seek_text?.trim() || (profile.topic_tags?.length ?? 0) > 0 || Object.keys(profile.links ?? {}).length > 0);
  return filled ? 2 : 1;
}

// 링크 공개 규칙. all 이면 명함을 가진 누구에게나, scanned 면 "그 사람을 직접 찍은 상대" 에게만.
export function visibleLinks(targetVisibility: string, iScannedThem: boolean, links: CardLinks | null | undefined): CardLinks | null {
  const clean = cleanLinks(links);
  if (Object.keys(clean).length === 0) return null;
  if (targetVisibility === "all" || iScannedThem) return clean;
  return null;
}

// 키 4개만 남기고 빈 값은 버린다.
export function cleanLinks(links: CardLinks | null | undefined): CardLinks {
  const out: CardLinks = {};
  for (const k of LINK_KEYS) {
    const v = (links?.[k] ?? "").toString().trim();
    if (v) out[k] = v;
  }
  return out;
}

// 링크 값 정규화. 이메일은 형식만 보고, 나머지는 스킴이 없으면 https:// 를 붙인다. 틀리면 null.
export function normalizeLink(key: LinkKey, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (key === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// 알림 문구. 화면과 로그가 같은 문장을 쓴다.
export function sharedMessage(name: string): string {
  return `${name} 님에게 명함이 공유되었습니다`;
}
