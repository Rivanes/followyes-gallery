import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processCanonicalMediaCleanup } from "../_shared/media-cleanup.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("CMS_CRON_SECRET") || "";
    const isScheduler = !!cronSecret && request.headers.get("x-cron-secret") === cronSecret;
    if (!isScheduler) {
      const caller = createClient(url, requiredEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: allowed, error } = await caller.rpc("is_platform_admin");
      if (error || allowed !== true) return response({ error: "Platform Admin permission required" }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: expiration, error: expirationError } = await admin.rpc("media_expire_abandoned_operations", { p_older_than: "24 hours" });
    if (expirationError) throw expirationError;
    const { data: orphanSweep, error: orphanError } = await admin.rpc("media_queue_unreferenced_scoped_media", { p_older_than: "24 hours", p_limit: Number(body.orphanLimit || 100) });
    if (orphanError) throw orphanError;
    const cleanup = await processCanonicalMediaCleanup(admin, Number(body.limit || 50));
    return response({ ok: true, expiration, orphanSweep, cleanup });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return response({ error: message }, 500);
  }
});

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
