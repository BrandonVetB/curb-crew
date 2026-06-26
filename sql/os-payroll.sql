-- ============================================================
--  Curb Crew OS — payroll + Stripe Connect payouts
--  Per-action pay, accrued from photo-verified service_events,
--  paid out bi-weekly via Stripe Connect.
--  Run ONCE in the Supabase SQL editor. Depends on os-setup.sql
--  (uses cc_is_admin() / cc_is_staff()). Safe to re-run.
-- ============================================================

-- 1. Pay rates (single config row, cents per action)
create table if not exists public.pay_rates (
  id int primary key default 1,
  rolled_out_cents int not null default 0,
  brought_in_cents int not null default 0,
  updated_at timestamptz not null default now(),
  constraint pay_rates_singleton check (id = 1)
);
insert into public.pay_rates (id) values (1) on conflict (id) do nothing;

-- 2. Stripe Connect account id per crew member (on their profile)
alter table public.profiles add column if not exists stripe_account_id text;

-- 3. Pay runs — one per bi-weekly period
create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null,
  status text not null default 'draft',   -- draft | paid | partial
  created_by uuid,
  created_at timestamptz not null default now()
);

-- 4. Payout line items — one per crew member per run
create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid references public.pay_runs(id) on delete cascade,
  crew_member_id uuid,
  rolled_out_count int not null default 0,
  brought_in_count int not null default 0,
  amount_cents int not null default 0,
  status text not null default 'pending',  -- pending | paid | failed
  stripe_transfer_id text,
  error text,
  created_at timestamptz not null default now()
);

-- ---------- RLS (admin manages; crew can read their own pay) ----------
alter table public.pay_rates    enable row level security;
alter table public.pay_runs     enable row level security;
alter table public.payout_items enable row level security;

drop policy if exists pr_admin_all on public.pay_rates;
create policy pr_admin_all on public.pay_rates
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());
drop policy if exists pr_staff_read on public.pay_rates;
create policy pr_staff_read on public.pay_rates
  for select using (public.cc_is_staff());

drop policy if exists prun_admin_all on public.pay_runs;
create policy prun_admin_all on public.pay_runs
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists pitem_admin_all on public.payout_items;
create policy pitem_admin_all on public.payout_items
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());
drop policy if exists pitem_self_read on public.payout_items;
create policy pitem_self_read on public.payout_items
  for select using (crew_member_id = auth.uid());

-- Verify:  select * from public.pay_rates;
