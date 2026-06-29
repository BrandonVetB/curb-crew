-- ============================================================
--  Curb Crew OS — Phase 0.3: tidy RLS policies
--  Drops EVERY policy on the OS public tables (the old duplicate
--  set AND ours) and recreates one clean canonical set using the
--  cc_* helper functions. All in one transaction, so there is no
--  "deny all" window. Storage policies (sp_*) are left untouched.
--  Depends on os-setup.sql having created cc_is_admin()/cc_is_staff().
-- ============================================================
begin;

-- 1. Drop all existing policies on the OS tables
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles','service_addresses','subscriptions','pickups','invoices',
        'service_events','routes','address_assignments','staff_roles',
        'ops_flags','ops_audit_log','leads','pay_rates','pay_runs','payout_items'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. Recreate the canonical set

-- profiles
create policy profiles_admin_all on public.profiles for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy profiles_staff_read on public.profiles for select using (public.cc_is_staff());
create policy profiles_self_read on public.profiles for select using (id = auth.uid());
create policy profiles_self_write on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());

-- service_addresses
create policy sa_admin_all on public.service_addresses for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy sa_staff_read on public.service_addresses for select using (public.cc_is_staff());
create policy sa_self_all on public.service_addresses for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- subscriptions
create policy sub_admin_all on public.subscriptions for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy sub_staff_read on public.subscriptions for select using (public.cc_is_staff());
create policy sub_self_all on public.subscriptions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- pickups
create policy pk_admin_all on public.pickups for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy pk_staff_read on public.pickups for select using (public.cc_is_staff());
create policy pk_staff_update on public.pickups for update using (public.cc_is_staff()) with check (public.cc_is_staff());
create policy pk_self_read on public.pickups for select using (profile_id = auth.uid());

-- invoices
create policy inv_admin_all on public.invoices for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy inv_self_read on public.invoices for select using (profile_id = auth.uid());

-- service_events
create policy se_admin_all on public.service_events for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy se_staff_read on public.service_events for select using (public.cc_is_staff());
create policy se_staff_insert on public.service_events for insert with check (public.cc_is_staff());
create policy se_staff_update on public.service_events for update using (public.cc_is_staff()) with check (public.cc_is_staff());
create policy se_self_read on public.service_events for select using (profile_id = auth.uid());

-- routes
create policy rt_admin_all on public.routes for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy rt_staff_read on public.routes for select using (public.cc_is_staff());

-- address_assignments
create policy aa_admin_all on public.address_assignments for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy aa_staff_read on public.address_assignments for select using (public.cc_is_staff());

-- staff_roles
create policy sr_admin_all on public.staff_roles for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy sr_staff_read on public.staff_roles for select using (public.cc_is_staff());

-- ops_flags
create policy of_admin_all on public.ops_flags for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy of_staff_rw on public.ops_flags for select using (public.cc_is_staff());
create policy of_staff_insert on public.ops_flags for insert with check (public.cc_is_staff());

-- ops_audit_log
create policy oal_admin_read on public.ops_audit_log for select using (public.cc_is_admin());
create policy oal_staff_insert on public.ops_audit_log for insert with check (public.cc_is_staff());

-- leads
create policy leads_insert_anon on public.leads for insert to anon, authenticated with check (true);
create policy leads_admin_read on public.leads for select using (public.cc_is_admin());

-- pay_rates
create policy pr_admin_all on public.pay_rates for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy pr_staff_read on public.pay_rates for select using (public.cc_is_staff());

-- pay_runs
create policy prun_admin_all on public.pay_runs for all using (public.cc_is_admin()) with check (public.cc_is_admin());

-- payout_items
create policy pitem_admin_all on public.payout_items for all using (public.cc_is_admin()) with check (public.cc_is_admin());
create policy pitem_self_read on public.payout_items for select using (crew_member_id = auth.uid());

commit;

-- Verify: select tablename, count(*) from pg_policies where schemaname='public' group by tablename order by tablename;
