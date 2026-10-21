// 마이페이지 명함 편집(10/11 피그마: 명함 편집 · Offer 수정 · Seek 수정 · 태그 추가).
// GET  → { offer_text, seek_text, topic_tags, seek_tags, edited, visibility, links }  명함에 보이는 값(고친 값이 있으면 그것)
// POST { offer_text?, seek_text?, topic_tags?, seek_tags? } → 같은 모양. 고친 값은 profiles.card_edit(0014)에만 저장한다.
//   피그마 안내대로 명함에만 반영되고 추천 · 배정 계산(계산 서비스가 읽는 원래 칸)에는 반영되지 않는다.
//   태그는 Offer(topic_tags, 명함의 INTERESTS) · Seek(seek_tags) 따로(10/21). seek_tags 처음 값은 사전 등록 관계 태그(intent_tags).
//   글자 수 80, 관심 태그 5개(_tags.ts). 사전 등록 값이 80자를 넘으면 그대로 둘 수 있게 서버는 300자까지 받는다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { cleanTags, TAG_MAX } from "../_tags";

export const dynamic = "force-dynamic";

type Edit = { offer_text?: string; seek_text?: string; topic_tags?: string[]; seek_tags?: string[] };

async function load(pid: string) {
  const [prof, me] = await Promise.all([
    db().from("profiles").select("offer_text, seek_text, topic_tags, intent_tags, links, card_edit").eq("participant_id", pid).maybeSingle(),
    db().from("participants").select("visibility").eq("id", pid).maybeSingle(),
  ]);
  if (prof.error) throw prof.error;
  if (me.error) throw me.error;
  const edit = (prof.data?.card_edit ?? null) as Edit | null;
  return {
    offer_text: edit?.offer_text ?? (prof.data?.offer_text as string) ?? "",
    seek_text: edit?.seek_text ?? (prof.data?.seek_text as string) ?? "",
    topic_tags: edit?.topic_tags ?? (prof.data?.topic_tags as string[]) ?? [],
    seek_tags: edit?.seek_tags ?? (prof.data?.intent_tags as string[]) ?? [],
    edited: !!edit,
    visibility: (me.data?.visibility as string) ?? "all",
    links: (prof.data?.links as Record<string, string>) ?? {},
    _edit: edit,
    _exists: !!prof.data,
  };
}

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const { _edit, _exists, ...out } = await load(s.pid); // eslint-disable-line @typescript-eslint/no-unused-vars
    return ok(out);
  });
}

const Body = z.object({
  offer_text: z.string().trim().max(300).optional(),
  seek_text: z.string().trim().max(300).optional(),
  topic_tags: z.array(z.string()).max(TAG_MAX * 2).optional(),
  seek_tags: z.array(z.string()).max(TAG_MAX * 2).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());
    const cur = await load(s.pid);
    if (!cur._exists) return fail("NOT_FOUND", "사전 등록 프로필이 없다. 운영진에게 문의한다", 404);
    const next: Edit = { ...(cur._edit ?? {}) };
    if (b.offer_text !== undefined) next.offer_text = b.offer_text;
    if (b.seek_text !== undefined) next.seek_text = b.seek_text;
    if (b.topic_tags !== undefined) next.topic_tags = cleanTags(b.topic_tags);
    if (b.seek_tags !== undefined) next.seek_tags = cleanTags(b.seek_tags);
    const { error } = await db().from("profiles").update({ card_edit: next, updated_at: new Date().toISOString() }).eq("participant_id", s.pid);
    if (error) throw error;
    await logEvent("card_edit", s.pid, { fields: Object.keys(b) });
    const { _edit, _exists, ...out } = await load(s.pid); // eslint-disable-line @typescript-eslint/no-unused-vars
    return ok(out);
  });
}
