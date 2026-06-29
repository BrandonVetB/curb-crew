// ============================================================
//  Curb Crews OS — admin delete user (Edge Function)
//  Admin-only. Unlinks the user's OS references (keeps service
//  history with a null crew), then deletes their auth login (which
//  cascades the profile). Soft-disable is preferred for active crew
//  (uncheck Active) — this is the hard delete.
//
//  Deploy: supabase functions deploy admin-delete-user --no-verify-jwt
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);

    const db = createClient(url, service);
    const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!me || me.role !== "admin") return json({ error: "Admin only" }, 403);

    const { target } = await req.json().catch(() => ({}));
    if (!target) return json({ error: "target required" }, 400);
    if (target === u.user.id) return json({ error: "You can't delete your own account" }, 400);

    // Unlink OS references so the profile can be removed (history kept, crew nulled)
    await db.from("service_events").update({ crew_member_id: null }).eq("crew_member_id", target);
    await db.from("address_assignments").update({ assigned_to: null }).eq("assigned_to", target);
    await db.from("routes").update({ lead_id: null }).eq("lead_id", target);
    await db.from("ops_flags").update({ raised_by: null }).eq("raised_by", target);
    await db.from("ops_audit_log").update({ actor_id: null }).eq("actor_id", target);
    await db.from("payout_items").update({ crew_member_id: null }).eq("crew_member_id", target);
    await db.from("crew_invites").update({ invited_by: null }).eq("invited_by", target);

    const del = await db.auth.admin.deleteUser(target);
    if (del.error) {
      // Fall back: remove the profile row directly if the auth delete is blocked
      await db.from("profiles").delete().eq("id", target);
      const retry = await db.auth.admin.deleteUser(target);
      if (retry.error) return json({ error: retry.error.message + " — the user may still have linked records; try unchecking Active instead." }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
