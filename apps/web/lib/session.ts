// 로그인 세션. 서명된 JWT 를 httpOnly 쿠키에 둔다. 요청 본문의 참가자 id 는 믿지 않는다.
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "orbit_session";
const TTL_SEC = 60 * 60 * 24; // 24시간

export type Session = { pid: string; admin: boolean };

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET 은 32자 이상이어야 한다");
  return new TextEncoder().encode(s);
}

export async function setSession(session: Session): Promise<void> {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEC}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SEC,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { pid: String(payload.pid), admin: Boolean(payload.admin) };
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401, "로그인이 필요하다");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!s.admin) throw new AuthError(403, "운영자만 쓸 수 있다");
  return s;
}
