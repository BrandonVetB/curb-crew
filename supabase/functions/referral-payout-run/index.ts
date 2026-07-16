// ============================================================
//  Curb Crew — Referral payout run (Edge Function)
//  Admin-only. Pays every APPROVED referral reward to the referring
//  crew member's connected Stripe account via a Stripe Connect
//  transfer, then marks each referral row `paid`. Rewards for the
//  same worker are combined into a single transfer.
//
//  Deploy:  supabase functions deploy referral-payout-run
//  Secret:  Stripe_Payment_Key  (same secret as stripe-payout-run)
//
//  NOTE: transfers move money from the platform's Stripe balance to
//  each connected account. Test in Stripe TEST mode first.
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const db = createClient(url, service);
    const { data: me } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!me || me.role !== "admin") return json({ error: "Admin only" }, 403);

    const { dry_run } = await req.json().catch(() => ({}));

    // All approved, unpaid referral rewards.
    const { data: refs } = await db.from("worker_referrals")
      .select("id, worker_id, reward_cents, monthly_cents, client_email")
      .eq("status", "approved");

    if (!refs || !refs.length) return json({ paid: 0, failed: 0, skipped: 0, total_cents: 0, message: "No approved referrals to pay." });

    // Group approved rewards by worker.
    const byWorker: Record<string, { ids: string[]; amount: number }> = {};
    for (const r of refs) {
      if (!r.worker_id) continue;
      const amt = (r.reward_cents != null ? r.reward_cents : r.monthly_cents) || 0;
      const g = (byWorker[r.worker_id] ||= { ids: [], amount: 0 });
      g.ids.push(r.id);
      g.amount += amt;
    }

    const workerIds = Object.keys(byWorker);
    const { data: profiles } = await db.from("profiles")
      .select("id, full_name, stripe_account_id")
      .in("id", workerIds.length ? workerIds : ["00000000-0000-0000-0000-000000000000"]);
    const profById: Record<string, any> = {};
    (profiles || []).forEach((p) => (profById[p.id] = p));

    const plan = workerIds.map((wid) => {
      const g = byWorker[wid], p = profById[wid] || {};
      return { worker_id: wid, name: p.full_name || "Unknown", stripe_account_id: p.stripe_account_id || null, ids: g.ids, amount_cents: g.amount };
    }).filter((x) => x.amount_cents > 0);

    if (dry_run) {
      return json({ dry_run: true, plan, total_cents: plan.reduce((s, x) => s + x.amount_cents, 0) });
    }

    let paid = 0, failed = 0, skipped = 0;
    const nowISO = new Date().toISOString();
    for (const x of plan) {
      if (!x.stripe_account_id) {
        skipped++;
        await db.from("worker_referrals").update({ pay_error: "Worker has not connected a Stripe account" }).in("id", x.ids);
        continue;
      }
      try {
        const tr = await stripe("transfers", {
          amount: String(x.amount_cents), currency: "usd", destination: x.stripe_account_id,
          description: "Curb Crew referral reward (" + x.ids.length + ")",
          "metadata[worker_id]": x.worker_id, "metadata[kind]": "referral",
        });
        await db.from("worker_referrals").update({ status: "paid", paid_at: nowISO, stripe_transfer_id: tr.id, pay_error: null }).in("id", x.ids);
        paid += x.ids.length;
      } catch (e) {
        failed += x.ids.length;
        await db.from("worker_referrals").update({ pay_error: String((e as Error)?.message || e) }).in("id", x.ids);
      }
    }

    await db.from("ops_audit_log").insert([{ actor_id: user.id, action: "Referral payout run", detail: `${paid} paid, ${failed} failed, ${skipped} no-account` }]);
    return json({ paid, failed, skipped, total_cents: plan.reduce((s, x) => s + x.amount_cents, 0) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
