// GET /api/tabletalk/orbit?round=tabletalk|coffeechat  궤도 시각화 데이터(개발 지시서 v0.2 N-01 · N-05). 기본 tabletalk.
// inner: 같은 테이블(그룹) 구성원. 나와의 쌍 점수(그 버전 pair_scores)가 높은 사람부터 순서대로(가까운 궤도 먼저). 최대 9명.
// outer: 다른 테이블 · 그룹. 대표 라벨(tables_meta.orbit_label, B-08)만 주고 개인 이름은 주지 않는다.
//   테이블토크는 실제 3×3 배치 위치(grid row · col, 1번이 왼쪽 위)를 같이 준다. 커피챗은 그룹이 8개보다 많으면 나와 평균 점수가 높은 8개만.
// 점수 · 순위 숫자는 내보내지 않는다(순서로만). 동의 거부자는 궤도에서 뺀다(v0.2 H-00).
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { getMyTable } from "@/lib/participants";
import { refusedAmong } from "@/lib/consent";
import { pairScores, versionMembers, byTable } from "@/lib/pairs";

export const dynamic = "force-dynamic";

const Round = z.enum(["tabletalk", "coffeechat"]);
const INNER_MAX = 9;
const OUTER_MAX = 8;
const GRID_COLS = 3;

const gridOf = (tableNo: number) => ({ row: Math.floor((tableNo - 1) / GRID_COLS), col: (tableNo - 1) % GRID_COLS });

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    const round = Round.parse(new URL(req.url).searchParams.get("round") ?? "tabletalk");
    const mine = await getMyTable(s.pid, round);
    if (!mine) return fail("NOT_PUBLISHED", "배정이 아직 공개되지 않았다", 404);
    const version = mine.version as number;

    const [members, score, meta] = await Promise.all([
      versionMembers(version),
      pairScores(version),
      db().from("tables_meta").select("table_no, orbit_label").eq("version", version),
    ]);
    if (meta.error) throw meta.error;
    const labelOf = new Map((meta.data ?? []).map((m) => [m.table_no as number, (m.orbit_label as string | null) ?? null]));
    const tables = byTable(members);

    const mates = (tables.get(mine.table_no as number) ?? []).filter((id) => id !== s.pid);
    const refused = await refusedAmong(mates);
    const innerIds = mates
      .filter((id) => !refused.has(id))
      .sort((a, b) => (score(s.pid, b) ?? -Infinity) - (score(s.pid, a) ?? -Infinity))
      .slice(0, INNER_MAX);
    const { data: people, error } = innerIds.length ? await db().from("participants").select("id, display_name, affiliation").in("id", innerIds) : { data: [], error: null };
    if (error) throw error;
    const who = new Map((people ?? []).map((p) => [p.id as string, p]));

    let others = [...tables.keys()].filter((t) => t !== mine.table_no);
    if (round === "coffeechat" && others.length > OUTER_MAX) {
      const mean = (t: number) => {
        const xs = (tables.get(t) ?? []).map((id) => score(s.pid, id)).filter((x): x is number => x !== null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : -Infinity;
      };
      others = others.sort((a, b) => mean(b) - mean(a)).slice(0, OUTER_MAX);
    }
    others.sort((a, b) => a - b);

    return ok({
      round,
      version,
      me: { table_no: mine.table_no, grid: round === "tabletalk" ? gridOf(mine.table_no as number) : null },
      inner: innerIds.map((id) => ({ id, display_name: (who.get(id)?.display_name as string) ?? "", affiliation: (who.get(id)?.affiliation as string | null) ?? null })),
      outer: others.map((t) => ({ table_no: t, label: labelOf.get(t) ?? null, grid: round === "tabletalk" ? gridOf(t) : null })),
    });
  });
}
