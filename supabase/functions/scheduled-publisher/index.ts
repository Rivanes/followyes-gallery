import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers });
  const expectedSecret = Deno.env.get("CMS_CRON_SECRET") || "";
  if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: "Supabase environment is incomplete" }), { status: 500, headers });
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.rpc("process_due_exhibition_publications");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  return new Response(JSON.stringify(data), { headers });
});
