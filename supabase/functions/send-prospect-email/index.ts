// ============================================================
//  Curb Crews OS — send a prospect a templated email (Edge Function)
//  Admin/lead-only. Templates: followup, discount, now_serving.
//  Uses Resend (RESEND_API_KEY). Records contact on the lead row.
//
//  Deploy: supabase functions deploy send-prospect-email --no-verify-jwt
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

function tpl(kind: string, name: string, area: string) {
  const hi = name ? `Hi ${name},` : "Hi there,";
  const site = "https://curbcrews.com";
  const wrap = (h: string) => `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0B0B0F">${h}
    <p style="margin:24px 0"><a href="${site}" style="background:#0066FF;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:12px;display:inline-block">Get started</a></p>
    <p style="font-size:12px;color:#888">Curb Crews — we take your bins to the curb and back. Reply to this email any time.</p></div>`;
  if (kind === "discount") return {
    subject: "A little something to get you started",
    html: wrap(`<h1 style="font-size:22px">50% off your first month</h1><p style="font-size:15px;line-height:1.6;color:#444">${hi} we'd love to take trash day off your plate. Use code <b>CURB50</b> at checkout for 50% off your first month of Curb Crews.</p>`),
  };
  if (kind === "now_serving") return {
    subject: `Good news — Curb Crews now serves ${area || "your street"}!`,
    html: wrap(`<h1 style="font-size:22px">We're on your street now</h1><p style="font-size:15px;line-height:1.6;color:#444">${hi} you asked us to let you know when we reach ${area || "your area"} — we're here! Set up your hands-off trash service in a couple of minutes.</p>`),
  };
  return {
    subject: "Still want to forget trash day?",
    html: wrap(`<h1 style="font-size:22px">Hands-off trash day is waiting</h1><p style="font-size:15px;line-height:1.6;color:#444">${hi} just checking in — we roll your bins to the curb the night before pickup and bring them back after. Want us to handle it?</p>`),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND = Deno.env.get("RESEND_API_KEY") || "";
    const FROM = Deno.env.get("INVITE_FROM") || "Curb Crews <team@curbcrews.com>";
    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const db = createClient(url, service);
    const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!me || !["crew_lead", "admin"].includes(me.role)) return json({ error: "Not allowed" }, 403);

    const { to, name, template, area, lead_id } = await req.json().catch(() => ({}));
    if (!to) return json({ error: "Recipient email required" }, 400);
    if (!RESEND) return json({ error: "Email not configured (RESEND_API_KEY missing)" }, 500);

    const t = tpl(template || "followup", name || "", area || "");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: t.subject, html: t.html }),
    });
    const out = await res.json();
    if (!res.ok) return json({ error: out?.message || ("Resend error " + res.status) }, 400);

    if (lead_id) await db.from("leads").update({ contacted_at: new Date().toISOString(), last_template: template || "followup" }).eq("id", lead_id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
