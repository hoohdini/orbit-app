// POST /api/card/settings { visibility?, links? }  내 명함의 공개 범위와 링크를 바꾼다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { LINK_KEYS, normalizeLink, type CardLinks } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({
  visibility: z.enum(["all", "scanned"]).optional(),
  links: z.partialRecord(z.enum(LINK_KEYS), z.string().max(200)).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const b = Body.parse(await req.json());

    let links: CardLinks | undefined;
    if (b.links) {
      links = {};
      for (const k of LINK_KEYS) {
        const raw = b.links[k];
        if (raw === undefined || raw.trim() === "") continue;
        const v = normalizeLink(k, raw);
        if (!v) return fail("BAD_INPUT", `${k} 형식이 맞지 않다`, 400);
        links[k] = v;
      }
      const { error } = await db().from("profiles").upsert({ participant_id: s.pid, links, updated_at: new Date().toISOString() }, { onConflict: "participant_id" });
      if (error) throw error;
    }

    if (b.visibility) {
      const { error } = await db().from("participants").update({ visibility: b.visibility }).eq("id", s.pid);
      if (error) throw error;
    }

    const [p, prof] = await Promise.all([
      db().from("participants").select("visibility").eq("id", s.pid).maybeSingle(),
      db().from("profiles").select("links").eq("participant_id", s.pid).maybeSingle(),
    ]);
    if (p.error) throw p.error;
    if (prof.error) throw prof.error;

    await logEvent("card_settings", s.pid, { visibility: b.visibility ?? null, links_changed: !!b.links });
    return ok({ visibility: (p.data?.visibility as string) ?? "scanned", links: (prof.data?.links as CardLinks) ?? {} });
  });
}
