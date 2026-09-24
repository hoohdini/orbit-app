import { db } from "@/lib/db";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus: "ok" | "fail" | "unconfigured" = "unconfigured";
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await db().from("ops_state").select("key").limit(1);
    dbStatus = error ? "fail" : "ok";
  }
  return ok({ version: "0.0.1", db: dbStatus, event_id: process.env.EVENT_ID ?? "dev" });
}
