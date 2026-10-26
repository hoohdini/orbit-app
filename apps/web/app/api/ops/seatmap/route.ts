// GET /api/ops/seatmap?version=&names=1|0  홀 좌석 배치도(10/26). 운영자만. 인쇄 좌석표(/api/ops/print)처럼 HTML 을 돌려준다.
// 영빈관 단면도(정면 빔프로젝터 · 뒤 다과 케이터링 · 출입구 오른쪽 아래) 위에 10개 원형 테이블을 실제 위치에 그리고
// 좌석 번호(1번이 위, 시계 방향)와 이름을 둘러 적는다. 커피챗 주도 선배(reason.lead) 자리는 색을 달리한다.
// 커피챗 시작 때 스크린에 띄워 사람들이 자기 테이블 · 자리를 찾게 하려는 것. 'PNG로 저장' 이 그림을 내려받는다.
// names=0 이면 번호만(스크린용). 이용 동의를 거부한 사람의 이름은 어느 쪽에도 넣지 않는다(남에게 보이는 화면에서 빠진다, DATA_SPEC).
// version 을 안 주면 round(tabletalk 기본 · coffeechat)의 공개 버전.
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, handle, eventId } from "@/lib/api";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const Query = z.object({
  round: z.enum(["tabletalk", "coffeechat"]).default("tabletalk"),
  version: z.coerce.number().int().positive().optional(),
  names: z.enum(["0", "1"]).default("1"),
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// 그림 좌표(가로 2000 · 세로 1330). 테이블 중심은 단면도(스크린샷 2026-10-21 오후 7.23.09) 위치를 옮긴 것
const W = 2000;
const H = 1330;
const ROOM = { x: 30, y: 100, w: 1940, h: 1200 };
const TABLES: Record<number, [number, number]> = {
  1: [490, 306], 2: [490, 677], 3: [487, 1050], 4: [893, 493], 5: [893, 933],
  6: [1297, 327], 7: [1297, 698], 8: [1295, 1072], 9: [1665, 501], 10: [1665, 942],
};
const R_TABLE = 84;
const R_SEAT = R_TABLE + 30;
const R_NAME = R_TABLE + 54;

type Seat = { id: string; seat: number | null; lead: boolean; fixed: boolean };

function tableSvg(no: number, seats: Seat[], name: (id: string) => string | null, fixedLabel: boolean): string {
  const [cx, cy] = TABLES[no] ?? [ROOM.x + 100 + ((no - 1) % 5) * 360, ROOM.y + 150 + Math.floor((no - 1) / 5) * 400];
  const list = [...seats].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999));
  const n = list.length;
  const parts = [
    `<circle cx="${cx}" cy="${cy}" r="${R_TABLE}" fill="#c9dfe8" stroke="#7d9cab" stroke-width="2"/>`,
    `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="58" font-weight="800" fill="#1d2b3a">${no}</text>`,
    `<text x="${cx}" y="${cy + 44}" text-anchor="middle" font-size="20" fill="#2c3e50">${fixedLabel ? "교수 · 운영진석" : "테이블"}</text>`,
  ];
  list.forEach((s, k) => {
    const label = s.seat ?? k + 1;
    const a = (-90 + (360 * k) / Math.max(1, n)) * (Math.PI / 180);
    const sx = cx + R_SEAT * Math.cos(a);
    const sy = cy + R_SEAT * Math.sin(a);
    parts.push(
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="16" fill="${s.lead ? "#1f3a5f" : "#ffffff"}" stroke="#1f3a5f" stroke-width="2"/>`,
      `<text x="${sx.toFixed(1)}" y="${(sy + 6).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="700" fill="${s.lead ? "#ffffff" : "#1f3a5f"}">${label}</text>`,
    );
    const nm = name(s.id);
    if (nm !== null) {
      const c = Math.cos(a);
      const nx = cx + R_NAME * c;
      const ny = cy + R_NAME * Math.sin(a) + 7 + (Math.sin(a) < -0.7 ? -8 : Math.sin(a) > 0.7 ? 10 : 0);
      const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
      parts.push(`<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="${anchor}" font-size="19" font-weight="600" fill="#1d2b3a">${esc(nm)}</text>`);
    }
  });
  return parts.join("");
}

function hallSvg(): string {
  const { x, y, w, h } = ROOM;
  const red = (x1: number, x2: number, yy: number) => `<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#d62828" stroke-width="5"/>`;
  const box = (bx: number, by: number, bw: number, bh: number, t: string) =>
    `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#5b7fb5"/><text x="${bx + bw / 2}" y="${by + bh / 2 + 7}" text-anchor="middle" font-size="20" font-weight="700" fill="#fff">${t}</text>`;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f6f6ee" stroke="#555" stroke-width="3"/>`,
    `<rect x="${x + 10}" y="${y + 205}" width="90" height="795" fill="#2e7d32"/>`,
    `<text transform="translate(${x + 68},${y + 602}) rotate(-90)" text-anchor="middle" font-size="36" font-weight="800" fill="#fff">정면 · 빔프로젝터</text>`,
    `<rect x="${x + w - 78}" y="${y + 205}" width="68" height="795" fill="#b77b22"/>`,
    `<text transform="translate(${x + w - 56},${y + 602}) rotate(90)" text-anchor="middle" font-size="32" font-weight="800" fill="#fff">뒤 · 다과 · 케이터링</text>`,
    red(x + 125, x + 215, y + 78), `<text x="${x + 170}" y="${y + 52}" text-anchor="middle" font-size="18" fill="#333">비상문</text>`,
    red(x + w - 270, x + w - 180, y + 78), `<text x="${x + w - 225}" y="${y + 52}" text-anchor="middle" font-size="18" fill="#333">비상문</text>`,
    red(x + 125, x + 360, y + h - 105), `<text x="${x + 240}" y="${y + h - 72}" text-anchor="middle" font-size="18" fill="#333">비상문</text>`,
    red(x + w - 415, x + w - 180, y + h - 105), `<text x="${x + w - 298}" y="${y + h - 72}" text-anchor="middle" font-size="24" font-weight="800" fill="#d62828">출입구</text>`,
    `<text x="${x + w - 90}" y="${y + h - 130}" text-anchor="end" font-size="18" fill="#333">에어컨</text>`,
    box(x + 120, y + 820, 118, 132, "사회자석"),
    box(x + 86, y + 972, 106, 110, "랩탑 콘솔"),
    box(x + 515, y + h - 62, 290, 62, "포토부스 설치"),
    box(x + 990, y + h - 82, 180, 52, "등록접수대"),
    box(x + 1180, y + h - 82, 178, 52, "모델링 안내"),
  ].join("");
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const q = Query.parse({ round: sp.get("round") ?? undefined, version: sp.get("version") ?? undefined, names: sp.get("names") ?? undefined });

    let vq = db().from("assign_versions").select("version, round, status").eq("event_id", eventId());
    vq = q.version ? vq.eq("version", q.version) : vq.eq("round", q.round).eq("status", "published").order("version", { ascending: false }).limit(1);
    const { data: vs, error } = await vq;
    if (error) throw error;
    const v = vs?.[0];
    if (!v) return fail("NOT_FOUND", "배치도를 그릴 배정 버전이 없다", 404);

    const { data: rows, error: mErr } = await db().from("table_members").select("participant_id, table_no, seat_no, reason").eq("version", v.version).range(0, 999);
    if (mErr) throw mErr;
    const members = rows ?? [];
    const ids = members.map((m) => m.participant_id as string);
    const { data: people, error: pErr } = ids.length
      ? await db().from("participants").select("id, display_name, consent_refused_at").in("id", ids)
      : { data: [], error: null };
    if (pErr) throw pErr;
    const who = new Map((people ?? []).map((p) => [p.id as string, p]));
    const showNames = q.names === "1";
    const name = (id: string) => {
      if (!showNames) return null;
      const p = who.get(id);
      return p && !p.consent_refused_at ? ((p.display_name as string) ?? "") : null;
    };

    const tables = new Map<number, Seat[]>();
    for (const m of members) {
      const t = m.table_no as number;
      const r = (m.reason ?? {}) as { lead?: boolean; fixed?: boolean };
      if (!tables.has(t)) tables.set(t, []);
      tables.get(t)!.push({ id: m.participant_id as string, seat: (m.seat_no as number | null) ?? null, lead: !!r.lead, fixed: !!r.fixed });
    }
    const hasLead = members.some((m) => (m.reason as { lead?: boolean } | null)?.lead);
    const body = [...tables.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, seats]) => tableSvg(t, seats, name, v.round === "tabletalk" && seats.some((s) => s.fixed)))
      .join("");

    const roundName = v.round === "tabletalk" ? "테이블토크" : "커피챗";
    const title = `${roundName} 좌석 배치도 (버전 ${v.version}${v.status === "published" ? "" : `, ${v.status}`})`;
    const legend = hasLead
      ? `<circle cx="${W - 330}" cy="60" r="14" fill="#1f3a5f"/><text x="${W - 308}" y="67" font-size="20" fill="#1d2b3a">주도 선배</text><circle cx="${W - 180}" cy="60" r="14" fill="#fff" stroke="#1f3a5f" stroke-width="2"/><text x="${W - 158}" y="67" font-size="20" fill="#1d2b3a">좌석 번호</text>`
      : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${W / 2}" y="62" text-anchor="middle" font-size="30" font-weight="800" fill="#1d2b3a">${esc(title)} · 1번 자리부터 시계 방향</text>${legend}
${hallSvg()}${body}</svg>`;

    const self = (names: string) => `/api/ops/seatmap?version=${v.version}&names=${names}`;
    const file = `${roundName}_좌석배치도_v${v.version}${showNames ? "" : "_번호만"}.png`;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;margin:12px;background:#eee;color:#111}
nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;font-size:14px}
nav a,nav button{border:1px solid #888;border-radius:8px;padding:4px 10px;background:#fff;color:#111;text-decoration:none;font-size:14px;cursor:pointer}
nav .on{background:#111;color:#fff;border-color:#111}#map svg{width:100%;height:auto;display:block;background:#fff}
@media print{nav{display:none}body{margin:0;background:#fff}}</style></head><body>
<nav><a class="${showNames ? "on" : ""}" href="${self("1")}">이름 넣기</a><a class="${showNames ? "" : "on"}" href="${self("0")}">번호만(스크린용)</a>
<button id="png" type="button">PNG로 저장</button><span>이용 동의를 거부한 분의 이름은 넣지 않는다</span></nav>
<div id="map">${svg}</div>
<script>
document.getElementById("png").addEventListener("click", function () {
  var svg = document.querySelector("#map svg");
  var src = new XMLSerializer().serializeToString(svg);
  var img = new Image();
  img.onload = function () {
    var c = document.createElement("canvas");
    c.width = ${W * 2}; c.height = ${H * 2};
    var g = c.getContext("2d"); g.scale(2, 2); g.drawImage(img, 0, 0);
    c.toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = ${JSON.stringify(file)}; a.click(); });
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
});
</script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  });
}
