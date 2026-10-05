// 저장된 벡터로 하는 점수 계산(시제품). 모델 없이 웹 서버에서 바로 한다. 계산 서비스 pipeline/scoring.py 와 같은 정의.
//   상호 점수(추천 기본) = min( cos(나의 찾는 사람, 상대의 하는 일), cos(상대의 찾는 사람, 나의 하는 일) )
import "server-only";
import { db } from "@/lib/db";

export type Vec = number[];
export type Vecs = { offer: Vec; seek: Vec };

export function unit(v: Vec): Vec {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 1e-12 ? v.map((x) => x / n) : v.map(() => 0);
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function mutual(me: Vecs, other: Vecs): number {
  return Math.min(dot(me.seek, other.offer), dot(other.seek, me.offer));
}

// 나의 찾는 방향을 목표 쪽으로 옮긴다(계산 서비스 seek_toward 와 같음: 내 방향과 직교하는 성분만 beta 만큼)
export function seekToward(seek: Vec, target: Vec, beta: number): Vec {
  const s = unit(seek);
  const t = unit(target);
  const proj = dot(t, s);
  const r = t.map((x, i) => x - proj * s[i]);
  const nr = Math.sqrt(dot(r, r));
  if (nr < 1e-12 || beta === 0) return s;
  return unit(s.map((x, i) => x + (beta * r[i]) / nr));
}

export function mean(vs: Vec[]): Vec {
  const out = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i] / vs.length;
  return out;
}

export async function loadVecs(ids: string[]): Promise<Map<string, Vecs>> {
  const out = new Map<string, Vecs>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("sids").select("participant_id, offer_vec, seek_vec").in("participant_id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) out.set(r.participant_id as string, { offer: unit(r.offer_vec as number[]), seek: unit(r.seek_vec as number[]) });
  }
  return out;
}
