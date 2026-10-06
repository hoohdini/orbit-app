// POST /api/ops/swap { version, a, b }  수동 교체(개발 지시서 v0.2 A-04). 운영자만.
// 원본 버전은 건드리지 않고 복사본 초안(draft)을 새로 만들어 두 사람의 테이블(과 좌석 번호)을 맞바꾼다. 공개는 /api/ops/publish 로 따로 한다.
// 변화량은 저장된 쌍 점수(pair_scores)로 웹 서버가 계산한다(계산 서비스 불필요). 목적함수 = 테이블 안 쌍 점수 합.
// 복사하는 것: table_members, tables_meta, pair_scores, recs, group_reasons. 바꾼 두 사람의 근거 한 줄(group_reasons)은 새 그룹과 맞지 않아 지운다.
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/log";
import { pairScores, versionMembers, byTable } from "@/lib/pairs";
import { UUID } from "../_lib";

export const dynamic = "force-dynamic";

const Body = z.object({ version: z.number().int().positive(), a: z.string().regex(UUID), b: z.string().regex(UUID) });
const PAGE = 1000;
const CHUNK = 500;

async function readAll(table: string, version: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from(table).select("*").eq("version", version).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function insertAll(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db().from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = Body.parse(await req.json());
    const [pa, pb] = [b.a.toLowerCase(), b.b.toLowerCase()];
    if (pa === pb) return fail("BAD_INPUT", "서로 다른 두 사람을 고른다", 400);

    const { data: src, error } = await db().from("assign_versions").select("version, round, status, params").eq("version", b.version).eq("event_id", eventId()).maybeSingle();
    if (error) throw error;
    if (!src) return fail("NOT_FOUND", "이 행사의 배정 버전이 아니다", 404);
    if (src.status === "retired") return fail("RETIRED", "철회된 버전은 고칠 수 없다", 409);

    const members = await versionMembers(b.version);
    const ma = members.find((m) => m.participant_id === pa);
    const mb = members.find((m) => m.participant_id === pb);
    if (!ma || !mb) return fail("NOT_FOUND", "두 사람이 이 버전에 배정돼 있지 않다", 404);
    if (ma.table_no === mb.table_no) return fail("SAME_TABLE", "같은 테이블 사람끼리는 바꿀 필요가 없다", 409);

    // 변화량: 두 테이블의 쌍 점수 합 전후
    const score = await pairScores(b.version);
    const tables = byTable(members);
    const sumWith = (ids: string[], who: string) => ids.filter((x) => x !== who).reduce((s, x) => s + (score(who, x) ?? 0), 0);
    const ta = tables.get(ma.table_no)!.filter((x) => x !== pa);
    const tb = tables.get(mb.table_no)!.filter((x) => x !== pb);
    // 바뀌는 건 두 사람이 낀 쌍뿐이다
    const before = sumWith(ta, pa) + sumWith(tb, pb);
    const after = sumWith(ta, pb) + sumWith(tb, pa);
    const delta = Math.round((after - before) * 1000) / 1000;

    const params = { ...((src.params ?? {}) as Record<string, unknown>), kind: "swap", source_version: b.version, swap: [pa, pb], swap_delta: delta, swap_by: admin.pid };
    const { data: nv, error: nvErr } = await db().from("assign_versions").insert({ round: src.round, status: "draft", params, event_id: eventId() }).select("version").single();
    if (nvErr) throw nvErr;
    const version = nv.version as number;

    const [tm, meta, ps, recs, reasons] = await Promise.all(["table_members", "tables_meta", "pair_scores", "recs", "group_reasons"].map((t) => readAll(t, b.version)));
    const swapped = (r: Record<string, unknown>) => {
      if (r.participant_id === pa) return { ...r, table_no: mb.table_no, seat_no: mb.seat_no, reason: { text: "운영자 수동 교체" } };
      if (r.participant_id === pb) return { ...r, table_no: ma.table_no, seat_no: ma.seat_no, reason: { text: "운영자 수동 교체" } };
      return r;
    };
    await insertAll("table_members", tm.map((r) => ({ ...swapped(r), version })));
    await insertAll("tables_meta", meta.map((r) => ({ ...r, version })));
    await insertAll("pair_scores", ps.map((r) => ({ ...r, version })));
    await insertAll("recs", recs.map((r) => ({ ...r, version })));
    await insertAll("group_reasons", reasons.filter((r) => ![pa, pb].includes(r.participant_id as string) && ![pa, pb].includes(r.target_id as string)).map((r) => ({ ...r, version })));

    await logEvent("ops_swap", admin.pid, { source_version: b.version, version, a: pa, b: pb, delta });
    return ok({ version, source_version: b.version, round: src.round, delta, before: Math.round(before * 1000) / 1000, after: Math.round(after * 1000) / 1000 });
  });
}
