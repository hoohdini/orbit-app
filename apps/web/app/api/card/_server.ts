// 명함 모듈 서버 전용 조회. 여러 route 가 같은 모양(Card)을 만들도록 한곳에 둔다.
import "server-only";
import { db } from "@/lib/db";
import { eventId } from "@/lib/api";
import { stageOf, themeOf, visibleLinks, type Card, type CardLinks, type CardSource } from "./_lib";

type Row = { id: string; display_name: string; affiliation: string | null; role: string; cohort: number | null; visibility: string; event_id: string };

// 요청 origin. Vercel 프록시 뒤에서는 x-forwarded-* 를 본다.
export function appOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

export function qrPayloadFor(origin: string, participantId: string): string {
  return `${origin}/card?p=${participantId}`;
}

export async function getParticipantInEvent(id: string): Promise<Row | null> {
  const { data, error } = await db()
    .from("participants")
    .select("id, display_name, affiliation, role, cohort, visibility, event_id")
    .eq("id", id)
    .eq("event_id", eventId())
    .maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

// 여러 사람의 명함을 한 번에 만든다. iScannedThem(id) 가 true 면 그 사람의 링크 공개 판정에 "내가 직접 찍음" 을 적용한다.
export async function buildCards(ids: string[], iScannedThem: (id: string) => boolean): Promise<Map<string, Card>> {
  const out = new Map<string, Card>();
  if (ids.length === 0) return out;
  const uniq = Array.from(new Set(ids));
  const [people, profiles, sids] = await Promise.all([
    db().from("participants").select("id, display_name, affiliation, role, cohort, visibility, event_id").in("id", uniq),
    db().from("profiles").select("participant_id, offer_text, seek_text, topic_tags, links").in("participant_id", uniq),
    db().from("sids").select("participant_id, offer_sid, codebook_version").in("participant_id", uniq),
  ]);
  if (people.error) throw people.error;
  if (profiles.error) throw profiles.error;
  if (sids.error) throw sids.error;

  const versions = Array.from(new Set((sids.data ?? []).map((s) => s.codebook_version as string)));
  const labelMap = new Map<string, string>();
  if (versions.length > 0) {
    const { data: labels, error } = await db().from("labels").select("codebook_version, prefix, label").in("codebook_version", versions);
    if (error) throw error;
    for (const l of labels ?? []) labelMap.set(`${l.codebook_version}|${(l.prefix as number[]).join("-")}`, l.label as string);
  }
  const labelFor = (version: string, sid: number[]) =>
    labelMap.get(`${version}|${sid.slice(0, 2).join("-")}`) ?? labelMap.get(`${version}|${sid.slice(0, 1).join("-")}`) ?? null;

  const profileOf = new Map((profiles.data ?? []).map((p) => [p.participant_id as string, p]));
  const sidOf = new Map((sids.data ?? []).map((s) => [s.participant_id as string, s]));

  for (const p of (people.data ?? []) as Row[]) {
    const prof = profileOf.get(p.id);
    const sidRow = sidOf.get(p.id);
    const sid = sidRow ? (sidRow.offer_sid as number[]) : null;
    const links = (prof?.links ?? null) as CardLinks | null;
    out.set(p.id, {
      id: p.id,
      display_name: p.display_name,
      affiliation: p.affiliation,
      role: p.role,
      cohort: p.cohort,
      stage: stageOf(prof ? { offer_text: prof.offer_text, seek_text: prof.seek_text, topic_tags: prof.topic_tags, links } : null, sid),
      sid,
      label: sid && sidRow ? labelFor(sidRow.codebook_version as string, sid) : null,
      theme: themeOf(sid),
      offer_text: (prof?.offer_text as string) ?? "",
      seek_text: (prof?.seek_text as string) ?? "",
      topic_tags: (prof?.topic_tags as string[]) ?? [],
      links: visibleLinks(p.visibility, iScannedThem(p.id), links),
    });
  }
  return out;
}

// 내 명함(본인이 보는 것). 링크는 항상 보인다.
export async function buildMyCard(id: string): Promise<Card | null> {
  const m = await buildCards([id], () => true);
  return m.get(id) ?? null;
}

export type ExchangeRow = {
  id: number; scanner_id: string; scanned_id: string; source: CardSource; seen_at: string | null; created_at: string;
  status: "pending" | "confirmed"; first_meet: boolean | null; first_meet_at: string | null; note: string | null;
};

export async function myExchanges(me: string): Promise<ExchangeRow[]> {
  const { data, error } = await db()
    .from("card_exchanges")
    .select("id, scanner_id, scanned_id, source, seen_at, created_at, status, first_meet, first_meet_at, note")
    .eq("scanner_id", me)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExchangeRow[];
}

// 교환 행 목록을 명함 목록으로. 내가 찍은 행(qr·manual)의 상대는 링크 공개 판정에서 "직접 찍음" 이다.
export async function cardsOf(rows: ExchangeRow[]): Promise<Card[]> {
  const scannedByMe = new Set(rows.filter((r) => r.source !== "auto").map((r) => r.scanned_id));
  const cards = await buildCards(
    rows.map((r) => r.scanned_id),
    (id) => scannedByMe.has(id),
  );
  const out: Card[] = [];
  for (const r of rows) {
    const c = cards.get(r.scanned_id);
    if (c) out.push({ ...c, source: r.source, exchanged_at: r.created_at, status: r.status, first_meet: r.first_meet, note: r.note });
  }
  return out;
}
