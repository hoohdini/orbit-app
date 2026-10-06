// POST /api/ops/add-participant  운영자. 워크인 추가. 숫자를 주지 않으면 무작위로 만들어 한 번만 돌려준다.
// 개발 지시서 v0.2 A-05: 공개된 테이블토크 배정이 있으면 고정 테이블(교수 · 운영진석)을 뺀 테이블 중 인원이 가장 적은 곳의 끝 좌석에 바로 앉힌다(assign_seat 기본 true).
// 주소(SID)는 여기서 붙이지 않는다. 체크인 마감 계산(/api/ops/compute job checkin)이 저장된 코드북으로 붙인다.
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({
  display_name: z.string().trim().min(1).max(20),
  affiliation: z.string().trim().max(40).optional(),
  role: z.enum(["student", "alumni", "professor", "staff", "other"]).default("student"),
  cohort: z.number().int().optional(),
  is_host: z.boolean().default(false),
  pin: z.string().regex(/^\d{4}$/).optional(),
  offer_text: z.string().max(120).default(""),
  seek_text: z.string().max(120).default(""),
  topic_tags: z.array(z.string()).default([]),
  assign_seat: z.boolean().default(true),
});

// 공개된 테이블토크에서 인원이 가장 적은 테이블(동률이면 번호 작은 쪽)의 끝 좌석
async function walkinSeat(pid: string) {
  const { data: v, error } = await db().from("assign_versions").select("version").eq("event_id", eventId()).eq("round", "tabletalk").eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!v) return null;
  const { data: rows, error: e } = await db().from("table_members").select("table_no, seat_no, participant_id").eq("version", v.version);
  if (e) throw e;
  const ids = (rows ?? []).map((r) => r.participant_id as string);
  const { data: fx, error: fe } = ids.length ? await db().from("participants").select("fixed_table").in("id", ids).not("fixed_table", "is", null) : { data: [], error: null };
  if (fe) throw fe;
  const fixed = new Set((fx ?? []).map((r) => r.fixed_table as number));
  const count = new Map<number, { n: number; seat: number }>();
  for (const r of rows ?? []) {
    const t = r.table_no as number;
    if (fixed.has(t)) continue;
    const c = count.get(t) ?? { n: 0, seat: 0 };
    count.set(t, { n: c.n + 1, seat: Math.max(c.seat, (r.seat_no as number | null) ?? 0) });
  }
  const best = [...count.entries()].sort((a, b) => a[1].n - b[1].n || a[0] - b[0])[0];
  if (!best) return null;
  // 좌석 번호가 없는 예전 배정이어도 겹치지 않게 인원 수와 가장 큰 좌석 번호 중 큰 쪽 다음 번호
  const seat = { version: v.version as number, table_no: best[0], seat_no: Math.max(best[1].seat, best[1].n) + 1 };
  const { error: ie } = await db().from("table_members").insert({ ...seat, participant_id: pid, reason: { text: "현장 등록, 인원이 가장 적은 테이블 끝 좌석" } });
  if (ie) throw ie;
  return seat;
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const pin = b.pin ?? String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const hash = await bcrypt.hash(pin, 10);
    const { data: p, error } = await db()
      .from("participants")
      .insert({ event_id: eventId(), display_name: b.display_name, affiliation: b.affiliation ?? null, role: b.role, cohort: b.cohort ?? null, is_host: b.is_host, login_pin_hash: hash })
      .select("id, display_name, affiliation, role, cohort")
      .single();
    if (error) throw error;
    const { error: e2 } = await db().from("profiles").insert({ participant_id: p.id, offer_text: b.offer_text, seek_text: b.seek_text, topic_tags: b.topic_tags });
    if (e2) throw e2;
    const seat = b.assign_seat ? await walkinSeat(p.id as string) : null;
    await logEvent("walkin_added", admin.pid, { target: p.id, seat });
    return ok({ participant: p, pin, seat }, 201);
  });
}
