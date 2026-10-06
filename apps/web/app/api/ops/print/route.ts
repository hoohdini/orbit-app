// GET /api/ops/print?round=tabletalk|coffeechat&version=  인쇄 배정표 · 좌석표(개발 지시서 v0.2 A-10). 운영자만.
// 통신 · 전원 장애 때 종이로 진행하려고 테이블별 좌석 순 명단을 인쇄용 HTML 로 돌려준다(브라우저 인쇄 → PDF 저장). 이 경로만 JSON 이 아니다.
// version 을 안 주면 그 라운드의 공개 버전. 한 테이블이 한 덩어리로 나오고 3열로 찍힌다.
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { versionMembers, byTable } from "@/lib/pairs";

export const dynamic = "force-dynamic";

const Query = z.object({ round: z.enum(["tabletalk", "coffeechat"]).default("tabletalk"), version: z.coerce.number().int().positive().optional() });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const q = Query.parse({ round: sp.get("round") ?? undefined, version: sp.get("version") ?? undefined });

    let vq = db().from("assign_versions").select("version, round, status, published_at").eq("event_id", eventId());
    vq = q.version ? vq.eq("version", q.version) : vq.eq("round", q.round).eq("status", "published").order("version", { ascending: false }).limit(1);
    const { data: vs, error } = await vq;
    if (error) throw error;
    const v = vs?.[0];
    if (!v) return fail("NOT_FOUND", "인쇄할 배정 버전이 없다", 404);

    const members = await versionMembers(v.version as number);
    const ids = members.map((m) => m.participant_id);
    const { data: people, error: pErr } = ids.length ? await db().from("participants").select("id, display_name, affiliation, cohort").in("id", ids) : { data: [], error: null };
    if (pErr) throw pErr;
    const who = new Map((people ?? []).map((p) => [p.id as string, p]));
    const seatOf = new Map(members.map((m) => [m.participant_id, m.seat_no]));

    const unit = v.round === "tabletalk" ? "테이블" : "그룹";
    const blocks = [...byTable(members).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, list]) => {
        const rows = list
          .sort((a, b) => (seatOf.get(a) ?? 999) - (seatOf.get(b) ?? 999))
          .map((id) => {
            const p = who.get(id);
            const seat = seatOf.get(id);
            return `<tr><td>${seat ?? ""}</td><td>${esc((p?.display_name as string) ?? "")}</td><td>${esc((p?.affiliation as string) ?? "")}</td><td>${p?.cohort ?? ""}</td></tr>`;
          })
          .join("");
        return `<section><h2>${unit} ${t} <small>${list.length}명</small></h2><table><thead><tr><th>좌석</th><th>이름</th><th>소속</th><th>기수</th></tr></thead><tbody>${rows}</tbody></table></section>`;
      })
      .join("");

    const title = `${v.round === "tabletalk" ? "테이블토크 좌석표" : "커피챗 배정표"} (버전 ${v.version}${v.status === "published" ? "" : `, ${v.status}`})`;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;margin:16px;color:#000;background:#fff}
h1{font-size:18px;margin:0 0 12px}main{columns:3;column-gap:16px}section{break-inside:avoid;margin:0 0 14px}
h2{font-size:15px;margin:0 0 4px}small{font-weight:normal;color:#555}table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #999;padding:2px 4px;text-align:left}th:first-child,td:first-child{width:2.5em;text-align:center}
@media print{body{margin:8mm}button{display:none}}</style></head><body>
<h1>${esc(title)}</h1><button onclick="print()">인쇄</button><main>${blocks}</main></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  });
}
