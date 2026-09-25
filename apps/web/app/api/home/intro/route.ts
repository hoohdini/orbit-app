// GET /api/home/intro  내 간단 소개
import { ok, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { getProfile } from "@/lib/participants";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const p = await getProfile(s.pid);
    return ok({ intro: p ? { offer_text: p.offer_text, seek_text: p.seek_text, topic_tags: p.topic_tags, intent_tags: p.intent_tags } : null });
  });
}
