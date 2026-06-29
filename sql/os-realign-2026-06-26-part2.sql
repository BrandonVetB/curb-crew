-- ============================================================
--  Curb Crews OS — realignment PART 2: restore staff RLS on shared tables
--  Project: hezahtnfyhqfucixzqxi   Date: 2026-06-26
--
--  Part 1 dropped the cc_* functions with CASCADE, which removed the
--  staff-read/write policies that had been defined in terms of cc_*
--  on the shared customer tables. This recreates them using the shared
--  public.is_staff()/is_admin() helpers so the OS (admin + crew) can
--  read customers, addresses, pickups, events, etc. again.
--
--  Customer self-access policies (auth.uid() based) were NOT cc_-based
--  and are untouched. Additive + idempotent. One transaction.
-- ============================================================
begin;

-- profiles: staff read all, admin update any (self policies remain)
drop policy if exists profiles_select_staff on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select_staff on public.profiles for select to authenticated using (public.is_staff());
create policy profiles_update_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- service_addresses: staff read + write (signup/customer self policies remain)
drop policy if exists addresses_select_staff on public.service_addresses;
drop policy if exists addresses_insert_staff on public.service_addresses;
drop policy if exists addresses_update_staff on public.service_addresses;
create policy addresses_select_staff on public.service_addresses for select to authenticated using (public.is_staff());
create policy addresses_insert_staff on public.service_addresses for insert to authenticated with check (public.is_staff());
create policy addresses_update_staff on public.service_addresses for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- subscriptions: staff read (billing writes stay website/Stripe-owned)
drop policy if exists subscriptions_select_staff on public.subscriptions;
create policy subscriptions_select_staff on public.subscriptions for select to authenticated using (public.is_staff());

-- pickups: staff read + update (generation stays website-owned; OS never inserts)
drop policy if exists pickups_select_staff on public.pickups;
drop policy if exists pickups_update_staff on public.pickups;
create policy pickups_select_staff on public.pickups for select to authenticated using (public.is_staff());
create policy pickups_update_staff on public.pickups for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- service_events: staff read + insert (crew logs) + update (admin approve/flag)
drop policy if exists events_select_staff on public.service_events;
drop policy if exists events_insert_staff on public.service_events;
drop policy if exists events_update_staff on public.service_events;
create policy events_select_staff on public.service_events for select to authenticated using (public.is_staff());
create policy events_insert_staff on public.service_events for insert to authenticated with check (public.is_staff());
create policy events_update_staff on public.service_events for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- invoices: staff read
drop policy if exists invoices_select_staff on public.invoices;
create policy invoices_select_staff on public.invoices for select to authenticated using (public.is_staff());

-- leads: admin read
drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select to authenticated using (public.is_admin());

-- service_photos: staff read + insert (crew uploads, admin review).
-- Customer "read own" policy, if any, is website-owned and left intact.
drop policy if exists photos_select_staff on public.service_photos;
drop policy if exists photos_insert_staff on public.service_photos;
create policy photos_select_staff on public.service_photos for select to authenticated using (public.is_staff());
create policy photos_insert_staff on public.service_photos for insert to authenticated with check (public.is_staff());

commit;

-- Verify (as a quick sanity check after running):
--   select tablename, count(*) from pg_policies
--   where schemaname='public' and tablename in
--     ('profiles','service_addresses','subscriptions','pickups',
--      'service_events','invoices','leads','service_photos')
--   group by tablename order by tablename;
