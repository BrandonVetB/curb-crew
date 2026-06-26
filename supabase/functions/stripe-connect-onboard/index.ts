// ============================================================
//  Curb Crew OS — Stripe Connect onboarding (Edge Function)
//  Creates (or reuses) a Stripe Connect Express account for the
//  signed-in crew member and returns an onboarding link so they
//  can connect their bank to receive payouts.
//
//  Deploy (Brandon / org owner):
//    supabase functions deploy stripe-connect-onboard
//  Secret used: Stripe_Payment_Key  (already set in this project)
// ============================================================
import Stripe from "npm:stripe@^16";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const stripe = new Stripe(Deno.env.get("Stripe_Payment_Key")!, { apiVersion: "2024-06-20" });
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify the caller from their JWT.
    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const db = createClient(url, service);

    // Must be staff (crew or admin) to set up payouts.
    const { data: role } = await db.from("staff_roles").select("role").ilike("email", (user.email || "").toLowerCase()).maybeSingle();
    if (!role || !["crew_member", "crew_lead", "admin"].includes(role.role)) {
      return json({ error: "Not a crew member" }, 403);
    }

    const { data: profile } = await db.from("profiles").select("id, email, stripe_account_id").eq("id", user.id).maybeSingle();
    let acctId = profile?.stripe_account_id as string | null;

    if (!acctId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        business_type: "individual",
      });
      acctId = acct.id;
      await db.from("profiles").update({ stripe_account_id: acctId }).eq("id", user.id);
    }

    const origin = req.headers.get("origin") || "https://curbcrews.com";
    const link = await stripe.accountLinks.create({
      account: acctId,
      type: "account_onboarding",
      refresh_url: `${origin}/crew.html`,
      return_url: `${origin}/crew.html`,
    });

    return json({ url: link.url, account: acctId });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
