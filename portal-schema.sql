-- ============================================================
-- Curb Crew - Client Portal database schema
-- Target: the "curb-crew" Supabase project (BrandonVetB org)
-- How to apply: Supabase Dashboard > SQL Editor > paste this whole
-- file > Run. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
--
-- After running, enable Email + Password sign-in:
--   Authentication > Providers > Email = ON
--   (for first tests you can turn OFF "Confirm email" so logins work
--    immediately; turn it back on before real launch)
-- And set Authentication > URL Configuration > Site URL to the live
-- portal URL (e.g. https://curb-crew.vercel.app/portal.html).
-- ============================================================

-- ------------------------------------------------------------
-- 1) PROFILES  (one row per signed-in user: identity + address + crew)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  full_name          text,
  email              text,
  phone              text,
  -- service address
  address_line1      text,
  city               text,
  state              text,
  zip                text,
  return_location    text,            -- "where we return cans"
  -- crew (kept simple/denormalized for now)
  crew_name          text,
  crew_region        text,
  crew_on_time_rate  numeric,
  created_at         timestamptz default now()
);

-- ------------------------------------------------------------
-- 2) SUBSCRIPTIONS  (one per user: plan state + Stripe linkage)
-- ------------------------------------------------------------
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  status                  text not null default 'active'
                            check (status in ('active','paused','cancelled')),
  base_plan_name          text default 'Curb Crew Plan',
  base_price_cents        integer default 3500,
  next_charge_date        date,
  stripe_customer_id      text,       -- filled in Phase 3 (billing)
  stripe_subscription_id  text,       -- filled in Phase 3 (billing)
  created_at              timestamptz default now(),
  unique (user_id)
);

-- ------------------------------------------------------------
-- 3) ADDONS  (shared catalog of optional services)
-- ------------------------------------------------------------
create table if not exists public.addons (
  slug         text primary key,
  name         text not null,
  description  text,
  price_cents  integer not null,
  active       boolean default true
);

-- ------------------------------------------------------------
-- 4) SUBSCRIPTION_ADDONS  (which add-ons each user has turned on)
-- ------------------------------------------------------------
create table if not exists public.subscription_addons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  addon_slug  text not null references public.addons(slug),
  active      boolean default true,
  created_at  timestamptz default now(),
  unique (user_id, addon_slug)
);

-- ------------------------------------------------------------
-- 5) PICKUPS  (the schedule table; also powers the activity feed)
-- ------------------------------------------------------------
create table if not exists public.pickups (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  pickup_date      date not null,
  out_night_before date,
  items            text,              -- e.g. 'Trash + Recycling'
  status           text default 'scheduled'
                     check (status in ('scheduled','holiday','completed')),
  created_at       timestamptz default now()
);

-- ------------------------------------------------------------
-- 6) PAYMENT_METHODS  (display only - real card data stays in Stripe)
-- ------------------------------------------------------------
create table if not exists public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  brand        text,
  last4        text,
  exp_month    integer,
  exp_year     integer,
  is_default   boolean default true,
  stripe_pm_id text,
  created_at   timestamptz default now()
);

-- ------------------------------------------------------------
-- 7) INVOICES  (billing history)
-- ------------------------------------------------------------
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  invoice_date     date not null,
  description      text,
  amount_cents     integer not null,
  status           text default 'paid',
  stripe_invoice_id text,
  receipt_url      text,
  created_at       timestamptz default now()
);

-- ============================================================
-- AUTO-PROVISION: on signup, create a profile + an active subscription
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));

  insert into public.subscriptions (user_id, status, next_charge_date)
  values (new.id, 'active', (date_trunc('month', now()) + interval '1 month')::date);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY  (each customer can only see their own data)
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.subscription_addons enable row level security;
alter table public.pickups             enable row level security;
alter table public.payment_methods     enable row level security;
alter table public.invoices            enable row level security;
alter table public.addons              enable row level security;

-- profiles: read + update own
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- subscriptions: read own (state changes happen via RPCs in Phase 2)
drop policy if exists "subs_select_own" on public.subscriptions;
create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- subscription_addons: full control of own rows
drop policy if exists "subaddons_all_own" on public.subscription_addons;
create policy "subaddons_all_own" on public.subscription_addons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- pickups / payment_methods / invoices: read own only
drop policy if exists "pickups_select_own" on public.pickups;
create policy "pickups_select_own" on public.pickups
  for select using (auth.uid() = user_id);
drop policy if exists "pm_select_own" on public.payment_methods;
create policy "pm_select_own" on public.payment_methods
  for select using (auth.uid() = user_id);
drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own" on public.invoices
  for select using (auth.uid() = user_id);

-- addons catalog: any signed-in user can read
drop policy if exists "addons_select_auth" on public.addons;
create policy "addons_select_auth" on public.addons
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- SEED the add-on catalog (matches the prices shown in the portal)
-- ============================================================
insert into public.addons (slug, name, description, price_cents) values
  ('recycling',    'Recycling can', 'Rolled out on recycling days',      800),
  ('yard_waste',   'Yard-waste can','Rolled out on collection days',     800),
  ('can_cleaning', 'Can cleaning',  'Monthly deep clean & deodorize',   1200)
on conflict (slug) do nothing;

-- ============================================================
-- NOTE (Phase 2): pause/cancel/add-on toggles will be added as
-- SECURITY DEFINER functions so customers can change their own
-- service state without being able to edit prices directly.
-- NOTE (Phase 3): Stripe webhooks (service role) will write to
-- payment_methods and invoices; columns above are ready for it.
-- ============================================================
