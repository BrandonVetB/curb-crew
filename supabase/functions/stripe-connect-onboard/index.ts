// ============================================================
//  Curb Crew OS — Stripe Connect onboarding (Edge Function)
//  Creates (or reuses) a Stripe Connect Express account for the
//  signed-in crew member and returns an onboarding link.
//  Uses Stripe's REST API via fetch (no SDK) to stay lightweight.
//
//  Deploy:  supabase functions deploy stripe-connect-onboard
//  Secret:  Stripe_Payment_Key
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

const STRIPE_KEY = Deno.env.get("Stripe_Payment_Key") || "";

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || ("Stripe error " + res.status));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!STRIPE_KEY) return json({ error: "Stripe key not configured" }, 500);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const db = createClient(url, service);
    const { data: profile } = await db.from("profiles").select("id, stripe_account_id, role").eq("id", user.id).maybeSingle();
    if (!profile || !["crew_member", "crew_lead", "admin"].includes(profile.role)) return json({ error: "Not a crew member" }, 403);
    let acctId = profile?.stripe_account_id as string | null;

    if (!acctId) {
      const acct = await stripe("accounts", {
        type: "express",
        email: user.email || "",
        "capabilities[transfers][requested]": "true",
        business_type: "individual",
      });
      acctId = acct.id;
      await db.from("profiles").update({ stripe_account_id: acctId }).eq("id", user.id);
    }

    const origin = req.headers.get("origin") || "https://curbcrews.com";
    const link = await stripe("account_links", {
      account: acctId!,
      type: "account_onboarding",
      refresh_url: `${origin}/crew.html`,
      return_url: `${origin}/crew.html`,
    });

    return json({ url: link.url, account: acctId });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
