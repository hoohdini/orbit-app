// 서버 전용 Supabase 클라이언트. API Route 와 서버 컴포넌트에서만 쓴다.
// 브라우저 번들에 들어가면 안 된다. 'server-only' 가 실수로 import 하면 빌드를 깨뜨린다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없다. apps/web/.env.local 을 확인한다");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
