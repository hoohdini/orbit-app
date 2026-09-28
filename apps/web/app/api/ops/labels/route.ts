// 이름표(라벨) 확인과 편집 (운영자 전용). 계산 서비스가 주소 첫자리 묶음마다 'A, B 계열' 초안을 달고, 운영진이 행사 전에 여기서 고친다.
// GET   이 행사의 활성 코드북과 그 이름표 목록(묶음마다 사람 수)
// POST  { codebook_version, prefix, label } 이름표 한 줄을 고친다(없으면 만든다). 계산 서비스는 새 코드북을 만들 때만 이름표를 쓰므로 덮어쓰지 않는다
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { eventParticipantIds, selectIn } from "../_lib";

export const dynamic = "force-dynamic";

async function activeCodebook(): Promise<string | null> {
  const { data, error } = await db().from("codebooks").select("version").eq("event_id", eventId()).eq("active", true).maybeSingle();
  if (error) throw error;
  return (data?.version as string) ?? null;
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const version = await activeCodebook();
    if (!version) return ok({ codebook_version: null, labels: [] });

    const [{ data: rows, error }, ids] = await Promise.all([db().from("labels").select("prefix, label").eq("codebook_version", version), eventParticipantIds()]);
    if (error) throw error;
    const sids = await selectIn<{ participant_id: string; offer_sid: number[]; codebook_version: string }>("sids", "participant_id, offer_sid, codebook_version", "participant_id", ids);
    const count = new Map<string, number>();
    for (const s of sids) {
      if (s.codebook_version !== version) continue;
      const k1 = String(s.offer_sid[0]);
      const k2 = s.offer_sid.slice(0, 2).join("-");
      count.set(k1, (count.get(k1) ?? 0) + 1);
      count.set(k2, (count.get(k2) ?? 0) + 1);
    }
    const labels = (rows ?? [])
      .map((r) => ({ prefix: r.prefix as number[], label: r.label as string, members: count.get((r.prefix as number[]).join("-")) ?? 0 }))
      .sort((a, b) => a.prefix.length - b.prefix.length || a.prefix.join("-").localeCompare(b.prefix.join("-")));
    return ok({ codebook_version: version, labels });
  });
}

const Body = z.object({
  codebook_version: z.string().min(1),
  prefix: z.array(z.number().int().min(0).max(99)).min(1).max(2),
  label: z.string().trim().min(1).max(40),
});

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const version = await activeCodebook();
    if (!version || version !== b.codebook_version) return fail("NOT_ACTIVE", "이 행사의 활성 코드북이 아니다. 화면을 새로 고친다", 409);
    const { error } = await db().from("labels").upsert({ codebook_version: b.codebook_version, prefix: b.prefix, label: b.label }, { onConflict: "codebook_version,prefix" });
    if (error) throw error;
    await logEvent("ops_label", admin.pid, { codebook_version: b.codebook_version, prefix: b.prefix, label: b.label });
    return ok({ saved: true });
  });
}
