// 배정 버전의 쌍 점수(pair_scores)와 구성원(table_members) 읽기. 운영 콘솔 지표(A-03), 수동 교체(A-04), 궤도(N-01 · N-05)가 같이 쓴다.
// pair_scores 는 버전마다 사람 쌍 하나에 한 행(a < b 순서는 보장하지 않음)이라 80명이면 3천 행이 넘는다. Supabase 는 한 번에 1000행까지만 주므로 나눠 읽는다.
import "server-only";
import { db } from "./db";

const PAGE = 1000;

export type PairScore = (a: string, b: string) => number | null;

export async function pairScores(version: number): Promise<PairScore> {
  const m = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from("pair_scores").select("a, b, score").eq("version", version).range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      m.set(`${r.a}|${r.b}`, r.score as number);
      m.set(`${r.b}|${r.a}`, r.score as number);
    }
    if (!data || data.length < PAGE) break;
  }
  return (a, b) => m.get(`${a}|${b}`) ?? null;
}

export type Member = { participant_id: string; table_no: number; seat_no: number | null };

export async function versionMembers(version: number): Promise<Member[]> {
  const out: Member[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("table_members")
      .select("participant_id, table_no, seat_no")
      .eq("version", version)
      .order("table_no")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Member[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// 테이블(그룹) 안 쌍 점수의 평균. 쌍이 없거나 점수가 없으면 null
export function groupMean(ids: string[], score: PairScore): number | null {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const s = score(ids[i], ids[j]);
      if (s !== null) {
        sum += s;
        n++;
      }
    }
  return n ? sum / n : null;
}

export function byTable(members: Member[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const r of members) {
    if (!m.has(r.table_no)) m.set(r.table_no, []);
    m.get(r.table_no)!.push(r.participant_id);
  }
  return m;
}
