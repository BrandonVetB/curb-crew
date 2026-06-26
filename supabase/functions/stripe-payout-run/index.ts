// ============================================================
//  Curb Crew OS — Stripe Connect payout run (Edge Function)
//  Admin-only. Computes each crew member's pay for a period from
//  photo-verified service_events x pay_rates, records a pay_run +
//  payout_items, and sends each connected crew member their pay
//  via a Stripe Connect transfer.
//
//  Deploy (Brandon / org owner):
//    supabase functions deploy stripe-payout-run
//  Secret used: Stripe_Payment_Key
//
//  NOTE: transfers move money from the platform's Stripe balance
//  to each crew member's connected account, so the platform must
//  hold an available balance. Test in Stripe TEST mode first.
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

    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const db = createClient(url, service);
    const { data: role } = await db.from("staff_roles").select("role").ilike("email", (user.email || "").toLowerCase()).maybeSingle();
    if (!role || role.role !== "admin") return json({ error: "Admin only" }, 403);

    const { period_start, period_end, dry_run } = await req.json().catch(() => ({}));
    if (!period_start || !period_end) return json({ error: "period_start and period_end required (YYYY-MM-DD)" }, 400);

    const { data: rates } = await db.from("pay_rates").select("*").eq("id", 1).maybeSingle();
    const ro = rates?.rolled_out_cents || 0;
    const bi = rates?.brought_in_cents || 0;
    if (ro === 0 && bi === 0) return json({ error: "Set pay rates before running a payout." }, 400);

    // Pull events in the period.
    const startISO = new Date(period_start + "T00:00:00").toISOString();
    const endISO = new Date(period_end + "T23:59:59").toISOString();
    const { data: events } = await db.from("service_events")
      .select("crew_member_id, event_type, occurred_at")
      .gte("occurred_at", startISO).lte("occurred_at", endISO);

    const agg: Record<string, { out: number; in: number }> = {};
    (events || []).forEach((e) => {
      if (!e.crew_member_id) return;
      const a = (agg[e.crew_member_id] ||= { out: 0, in: 0 });
      if (e.event_type === "rolled_out") a.out++;
      else if (e.event_type === "brought_in") a.in++;
    });

    const crewIds = Object.keys(agg);
    const { data: profiles } = await db.from("profiles").select("id, full_name, stripe_account_id").in("id", crewIds.length ? crewIds : ["00000000-0000-0000-0000-000000000000"]);
    const profById: Record<string, any> = {};
    (profiles || []).forEach((p) => (profById[p.id] = p));

    // Build the line items.
    const items = crewIds.map((id) => {
      const a = agg[id], p = profById[id] || {};
      const amount = a.out * ro + a.in * bi;
      return { crew_member_id: id, name: p.full_name || "Unknown", stripe_account_id: p.stripe_account_id || null, rolled_out_count: a.out, brought_in_count: a.in, amount_cents: amount };
    }).filter((i) => i.amount_cents > 0);

    // Dry run: just return what WOULD be paid, no money moves, no records.
    if (dry_run) {
      return json({ dry_run: true, period_start, period_end, items, total_cents: items.reduce((s, i) => s + i.amount_cents, 0) });
    }

    // Create the pay run.
    const { data: run, error: runErr } = await db.from("pay_runs")
      .insert([{ period_start, period_end, status: "draft", created_by: user.id }]).select().single();
    if (runErr) return json({ error: runErr.message }, 400);

    let paid = 0, failed = 0, skipped = 0;
    for (const it of items) {
      let status = "pending", transferId: string | null = null, errMsg: string | null = null;
      if (!it.stripe_account_id) {
        status = "failed"; errMsg = "No connected Stripe account"; skipped++;
      } else {
        try {
          const tr = await stripe.transfers.create({
            amount: it.amount_cents, currency: "usd", destination: it.stripe_account_id,
            description: `Curb Crew pay ${period_start} to ${period_end}`,
            metadata: { crew_member_id: it.crew_member_id, pay_run_id: run.id },
          });
          status = "paid"; transferId = tr.id; paid++;
        } catch (e) {
          status = "failed"; errMsg = String((e as Error)?.message || e); failed++;
        }
      }
      await db.from("payout_items").insert([{
        pay_run_id: run.id, crew_member_id: it.crew_member_id,
        rolled_out_count: it.rolled_out_count, brought_in_count: it.brought_in_count,
        amount_cents: it.amount_cents, status, stripe_transfer_id: transferId, error: errMsg,
      }]);
    }

    await db.from("pay_runs").update({ status: failed || skipped ? "partial" : "paid" }).eq("id", run.id);
    await db.from("ops_audit_log").insert([{ actor_id: user.id, action: "Payout run", detail: `${period_start}..${period_end}: ${paid} paid, ${failed} failed, ${skipped} no-account` }]);

    return json({ pay_run_id: run.id, paid, failed, skipped, total_cents: items.reduce((s, i) => s + i.amount_cents, 0) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
