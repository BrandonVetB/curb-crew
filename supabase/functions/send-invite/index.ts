// ============================================================
//  Curb Crews OS — send crew invite email (Edge Function)
//  Emails a branded onboarding link via Resend. Caller must be
//  staff (crew_lead or admin). The copyable link in the OS is the
//  fallback if email isn't configured.
//
//  Deploy:  supabase functions deploy send-invite --no-verify-jwt
//  Secret:  RESEND_API_KEY   (optional INVITE_FROM, INVITE_BASE_URL)
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
    const RESEND = Deno.env.get("RESEND_API_KEY") || "";
    const FROM = Deno.env.get("INVITE_FROM") || "Curb Crews <team@curbcrews.com>";
    const BASE = Deno.env.get("INVITE_BASE_URL") || "https://os.curbcrews.com";

    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const db = createClient(url, service);
    const { data: me } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!me || !["crew_lead", "admin"].includes(me.role)) return json({ error: "Not allowed" }, 403);

    const { email, token, role, neighborhood, inviter } = await req.json().catch(() => ({}));
    if (!email || !token) return json({ error: "email and token required" }, 400);
    if (!RESEND) return json({ error: "Email not configured (RESEND_API_KEY missing)" }, 500);

    const link = `${BASE}/onboard.html?token=${encodeURIComponent(token)}`;
    const roleLabel = role === "crew_lead" ? "Neighborhood Lead" : "Crew Member";
    const who = inviter || "The Curb Crews team";
    const hood = neighborhood ? ` in ${neighborhood}` : "";

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0B0B0F">
        <h1 style="font-size:22px;margin:0 0 6px">You're invited to Curb Crews</h1>
        <p style="font-size:15px;line-height:1.6;color:#444">${who} invited you to join Curb Crews${hood} as a <strong>${roleLabel}</strong>.</p>
        <p style="font-size:15px;line-height:1.6;color:#444">Curb Crews takes neighbors' trash and recycling bins to the curb on pickup day and brings them back. Tap below to set up your account, it takes about 3 minutes.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#0066FF;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:12px;display:inline-block">Start onboarding</a>
        </p>
        <p style="font-size:13px;color:#888;line-height:1.6">Or paste this link into your browser:<br>${link}</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email], subject: "You're invited to join Curb Crews", html }),
    });
    const out = await res.json();
    if (!res.ok) return json({ error: out?.message || ("Resend error " + res.status) }, 400);
    return json({ ok: true, id: out?.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
