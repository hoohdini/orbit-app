// GET /api/card/tags?q=  다른 참가자들의 관심 태그와 사람 수(시제품, 민찬 제안 2026-10-05).
// 입력 없이 태그를 눌러 사람을 찾게 하려고 둔다. 누르면 화면이 /api/card/keyword?q=<태그> 를 부른다.
// q 를 주면 자동완성용: 그 글자(또는 줄임말 사전의 같은 뜻 다른 표기)가 들어간 태그만 사람 많은 순 8개(10/5 민찬 결정).
//   사람들이 이미 쓴 표기로 검색하게 돼, 사전에 없는 표기도 덜 놓친다. 화면(검색창)은 명함 모듈 담당이 채택 뒤 붙인다
// 검색과 같은 범위(체크인 · 동의, 본인 제외)라 숫자가 누른 결과 수와 맞는다
import { ok, fail, handle } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { tagCounts, expandQuery, containsTerm } from "../_keyword";
import { searchablePeople, canSearch } from "../_people";

export const dynamic = "force-dynamic";

const SUGGEST_LIMIT = 8;

export async function GET(req: Request) {
  return handle(async () => {
    const s = await requireSession();
    if (!(await canSearch(s.pid))) return fail("FORBIDDEN", "이용 동의와 체크인 뒤에 볼 수 있다", 403);
    const tags = tagCounts((await searchablePeople()).filter((p) => p.id !== s.pid));
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 30);
    if (!q) return ok({ tags });
    const { terms } = expandQuery(q);
    return ok({ tags: tags.filter((t) => terms.some((x) => containsTerm(t.tag, x))).slice(0, SUGGEST_LIMIT) });
  });
}
