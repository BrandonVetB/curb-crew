-- ============================================================
--  Curb Crews OS — realignment to the shared data contract
--  Project: hezahtnfyhqfucixzqxi   Date: 2026-06-26
--
--  Removes the duplicate cc_* identity functions (they drift from
--  the shared public.is_staff()/is_admin()) and re-points all
--  OS-owned tables onto those shared helpers. Drops the retired
--  staff_roles table. Sets the two owner accounts to role=admin so
--  no one is locked out when the OS switches to profiles.role.
--
--  Safe to run more than once. One transaction.
--  Prereq: public.is_staff() and public.is_admin() already exist
--  (ops_staff_foundation_applied.sql, live since 2026-06-25).
-- ============================================================
begin;

-- 0. Owner safety: keep OS access after the switch to profiles.role
update public.profiles p set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) in ('ryanoarnold44@gmail.com', 'brandon.stelling@gmail.com');

-- 1. Retire the OS-only staff_roles table (identity now lives on profiles.role)
drop table if exists public.staff_roles cascade;

-- 2. Re-point OS-owned table policies onto is_staff()/is_admin()

-- routes
drop policy if exists rt_admin_all  on public.routes;
drop policy if exists rt_staff_read on public.routes;
create policy rt_admin_all  on public.routes for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rt_staff_read on public.routes for select to authenticated using (public.is_staff());

-- address_assignments
drop policy if exists aa_admin_all  on public.address_assignments;
drop policy if exists aa_staff_read on public.address_assignments;
create policy aa_admin_all  on public.address_assignments for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy aa_staff_read on public.address_assignments for select to authenticated using (public.is_staff());

-- ops_flags
drop policy if exists of_admin_all   on public.ops_flags;
drop policy if exists of_staff_rw     on public.ops_flags;
drop policy if exists of_staff_select on public.ops_flags;
drop policy if exists of_staff_insert on public.ops_flags;
create policy of_admin_all   on public.ops_flags for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy of_staff_select on public.ops_flags for select to authenticated using (public.is_staff());
create policy of_staff_insert on public.ops_flags for insert to authenticated with check (public.is_staff());

-- ops_audit_log
drop policy if exists oal_admin_read   on public.ops_audit_log;
drop policy if exists oal_staff_insert on public.ops_audit_log;
create policy oal_admin_read   on public.ops_audit_log for select to authenticated using (public.is_admin());
create policy oal_staff_insert on public.ops_audit_log for insert to authenticated with check (public.is_staff());

-- pay_rates
drop policy if exists pr_admin_all  on public.pay_rates;
drop policy if exists pr_staff_read on public.pay_rates;
create policy pr_admin_all  on public.pay_rates for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pr_staff_read on public.pay_rates for select to authenticated using (public.is_staff());

-- pay_runs
drop policy if exists prun_admin_all on public.pay_runs;
create policy prun_admin_all on public.pay_runs for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- payout_items
drop policy if exists pitem_admin_all  on public.payout_items;
drop policy if exists pitem_self_read on public.payout_items;
create policy pitem_admin_all on public.payout_items for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pitem_self_read on public.payout_items for select to authenticated using (crew_member_id = auth.uid());

-- os_settings
drop policy if exists oss_admin_all on public.os_settings;
drop policy if exists oss_read_all  on public.os_settings;
create policy oss_admin_all on public.os_settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy oss_read_all  on public.os_settings for select to anon, authenticated using (true);

-- 3. Drop the duplicate cc_* helpers. CASCADE removes any remaining
--    cc_-based policies (the ones I previously created on the shared
--    customer tables); the website's is_staff/is_admin policies and the
--    customer self-access policies do not depend on cc_ and are kept.
drop function if exists public.cc_is_admin() cascade;
drop function if exists public.cc_is_staff() cascade;
drop function if exists public.cc_role()     cascade;
drop function if exists public.cc_email()    cascade;

commit;

-- ============================================================
-- OPTIONAL — storage policies for the now-private service-photos
-- bucket. The website team built the photo system, so these likely
-- already exist. Run ONLY if crew photo upload fails with a storage
-- permission error. Harmless if duplicated (permissive policies OR).
-- ============================================================
-- begin;
-- drop policy if exists sp_staff_all     on storage.objects;
-- drop policy if exists sp_customer_read on storage.objects;
-- create policy sp_staff_all on storage.objects for all to authenticated
--   using (bucket_id = 'service-photos' and public.is_staff())
--   with check (bucket_id = 'service-photos' and public.is_staff());
-- create policy sp_customer_read on storage.objects for select to authenticated
--   using (bucket_id = 'service-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- commit;

-- Verify:
--   select proname from pg_proc where proname like 'cc\_%';          -- expect 0 rows
--   select tablename, policyname from pg_policies
--     where schemaname='public' and tablename in
--     ('routes','address_assignments','ops_flags','ops_audit_log',
--      'pay_rates','pay_runs','payout_items','os_settings')
--     order by tablename;
--   select u.email, p.role from public.profiles p join auth.users u on u.id=p.id
--     where p.role='admin';
