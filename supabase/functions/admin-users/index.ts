import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  let inviteId: string | null = null;
  let admin: any = null;
  try {
    const url = requiredEnv("SUPABASE_URL");
    const anon = requiredEnv("SUPABASE_ANON_KEY");
    const service = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization") || "";
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const [{ data: allowed, error: permissionError }, { data: userData, error: userError }] = await Promise.all([
      caller.rpc("is_platform_admin"),
      caller.auth.getUser()
    ]);
    if (permissionError || allowed !== true || userError || !userData.user) return json({ error: "Platform Admin permission required" }, 403);

    const body = await request.json();
    if (body.action !== "invite") return json({ error: "Unsupported action" }, 400);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Email is required" }, 400);

    const platformRole = body.platformRole === "platform_admin" ? "platform_admin" : "viewer";
    const requestedAccess = {
      platformRole,
      venueRoles: Array.isArray(body.venueRoles) ? body.venueRoles : [],
      exhibitionRoles: Array.isArray(body.exhibitionRoles) ? body.exhibitionRoles : []
    };
    admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    await admin.from("user_invites").delete().eq("email", email).in("status", ["pending", "failed", "cancelled"]);
    const { data: inviteRow, error: inviteRowError } = await admin.from("user_invites").insert({
      email,
      display_name: String(body.displayName || ""),
      requested_access: requestedAccess,
      status: "pending",
      requested_by: userData.user.id
    }).select("id").single();
    if (inviteRowError) throw inviteRowError;
    inviteId = inviteRow.id;

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: String(body.displayName || "") },
      redirectTo: `${(Deno.env.get("SITE_URL") || new URL(request.url).origin).replace(/\/$/, "")}/admin/`
    });
    if (inviteError) throw inviteError;
    const userId = invited.user?.id;
    if (!userId) throw new Error("Invitation did not return a user id");

    const { error: profileError } = await admin.from("profiles").upsert({ user_id: userId, display_name: String(body.displayName || ""), active: true });
    if (profileError) throw profileError;
    const { error: platformError } = await admin.from("platform_memberships").upsert({ user_id: userId, role: platformRole });
    if (platformError) throw platformError;

    if (requestedAccess.venueRoles.length) {
      const { error } = await admin.from("venue_memberships").upsert(requestedAccess.venueRoles.map((item: any) => ({
        venue_id: item.venueId,
        user_id: userId,
        role: item.role === "venue_admin" ? "venue_admin" : "viewer"
      })));
      if (error) throw error;
    }
    if (requestedAccess.exhibitionRoles.length) {
      const { error } = await admin.from("exhibition_memberships").upsert(requestedAccess.exhibitionRoles.map((item: any) => ({
        exhibition_id: item.exhibitionId,
        user_id: userId,
        role: item.role === "curator" ? "curator" : "viewer"
      })));
      if (error) throw error;
    }

    const { error: inviteUpdateError } = await admin.from("user_invites").update({ status: "sent", auth_user_id: userId, updated_at: new Date().toISOString() }).eq("id", inviteId);
    if (inviteUpdateError) throw inviteUpdateError;
    await admin.from("admin_audit_log").insert({ entity_type: "user", entity_id: userId, action: "invite-sent", details: { email, platformRole, inviteId } });
    return json({ ok: true, userId, email, inviteId });
  } catch (error) {
    console.error(error);
    if (admin && inviteId) {
      try { await admin.from("user_invites").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", inviteId); } catch (_) {}
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
