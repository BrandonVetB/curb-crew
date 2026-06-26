-- ============================================================
--  Curb Crew OS — security foundation
--  Run ONCE in the Supabase SQL editor (curb-crew project).
--  Sets up: role helpers, Row Level Security policies for the
--  crew + admin apps and the customer portal, and a Storage
--  bucket for crew service photos.
--
--  Safe to re-run: policies are dropped and recreated.
-- ============================================================

-- ---------- 1. Role helper functions ----------
-- These read the caller's role from staff_roles by their auth email.
-- SECURITY DEFINER so they can read staff_roles without tripping its own RLS.

create or replace function public.cc_email() returns text
  language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.cc_role() returns app_role
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.staff_roles where lower(email) = public.cc_email() limit 1),
    'customer'::app_role);
$$;

create or replace function public.cc_is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.cc_role() in ('crew_member','crew_lead','admin');
$$;

create or replace function public.cc_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.cc_role() = 'admin';
$$;

-- ---------- 2. Enable RLS on every OS table ----------
alter table public.profiles            enable row level security;
alter table public.service_addresses   enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.pickups             enable row level security;
alter table public.invoices            enable row level security;
alter table public.service_events      enable row level security;
alter table public.routes              enable row level security;
alter table public.address_assignments enable row level security;
alter table public.staff_roles         enable row level security;
alter table public.ops_flags           enable row level security;
alter table public.ops_audit_log       enable row level security;
alter table public.leads               enable row level security;

-- ---------- 3. PROFILES ----------
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles
  for select using (public.cc_is_staff());

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- ---------- 4. SERVICE_ADDRESSES ----------
drop policy if exists sa_admin_all on public.service_addresses;
create policy sa_admin_all on public.service_addresses
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists sa_staff_read on public.service_addresses;
create policy sa_staff_read on public.service_addresses
  for select using (public.cc_is_staff());

drop policy if exists sa_self_all on public.service_addresses;
create policy sa_self_all on public.service_addresses
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- 5. SUBSCRIPTIONS ----------
drop policy if exists sub_admin_all on public.subscriptions;
create policy sub_admin_all on public.subscriptions
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists sub_staff_read on public.subscriptions;
create policy sub_staff_read on public.subscriptions
  for select using (public.cc_is_staff());

drop policy if exists sub_self_all on public.subscriptions;
create policy sub_self_all on public.subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- 6. PICKUPS ----------
drop policy if exists pk_admin_all on public.pickups;
create policy pk_admin_all on public.pickups
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

-- crew can read pickups and update status (mark completed/missed/skipped)
drop policy if exists pk_staff_read on public.pickups;
create policy pk_staff_read on public.pickups
  for select using (public.cc_is_staff());

drop policy if exists pk_staff_update on public.pickups;
create policy pk_staff_update on public.pickups
  for update using (public.cc_is_staff()) with check (public.cc_is_staff());

drop policy if exists pk_self_read on public.pickups;
create policy pk_self_read on public.pickups
  for select using (profile_id = auth.uid());

-- ---------- 7. INVOICES ----------
drop policy if exists inv_admin_all on public.invoices;
create policy inv_admin_all on public.invoices
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists inv_self_read on public.invoices;
create policy inv_self_read on public.invoices
  for select using (profile_id = auth.uid());

-- ---------- 8. SERVICE_EVENTS ----------
drop policy if exists se_admin_all on public.service_events;
create policy se_admin_all on public.service_events
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

-- staff read all events; crew create events they performed
drop policy if exists se_staff_read on public.service_events;
create policy se_staff_read on public.service_events
  for select using (public.cc_is_staff());

drop policy if exists se_staff_insert on public.service_events;
create policy se_staff_insert on public.service_events
  for insert with check (public.cc_is_staff());

drop policy if exists se_staff_update on public.service_events;
create policy se_staff_update on public.service_events
  for update using (public.cc_is_staff()) with check (public.cc_is_staff());

drop policy if exists se_self_read on public.service_events;
create policy se_self_read on public.service_events
  for select using (profile_id = auth.uid());

-- ---------- 9. ROUTES ----------
drop policy if exists rt_admin_all on public.routes;
create policy rt_admin_all on public.routes
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists rt_staff_read on public.routes;
create policy rt_staff_read on public.routes
  for select using (public.cc_is_staff());

-- ---------- 10. ADDRESS_ASSIGNMENTS ----------
drop policy if exists aa_admin_all on public.address_assignments;
create policy aa_admin_all on public.address_assignments
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists aa_staff_read on public.address_assignments;
create policy aa_staff_read on public.address_assignments
  for select using (public.cc_is_staff());

-- ---------- 11. STAFF_ROLES ----------
drop policy if exists sr_admin_all on public.staff_roles;
create policy sr_admin_all on public.staff_roles
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists sr_staff_read on public.staff_roles;
create policy sr_staff_read on public.staff_roles
  for select using (public.cc_is_staff());

-- ---------- 12. OPS_FLAGS ----------
drop policy if exists of_admin_all on public.ops_flags;
create policy of_admin_all on public.ops_flags
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists of_staff_rw on public.ops_flags;
create policy of_staff_rw on public.ops_flags
  for select using (public.cc_is_staff());

drop policy if exists of_staff_insert on public.ops_flags;
create policy of_staff_insert on public.ops_flags
  for insert with check (public.cc_is_staff());

-- ---------- 13. OPS_AUDIT_LOG ----------
drop policy if exists oal_admin_read on public.ops_audit_log;
create policy oal_admin_read on public.ops_audit_log
  for select using (public.cc_is_admin());

drop policy if exists oal_staff_insert on public.ops_audit_log;
create policy oal_staff_insert on public.ops_audit_log
  for insert with check (public.cc_is_staff());

-- ---------- 14. LEADS (homepage waitlist) ----------
-- keep public/anon inserts working; only admins can read.
drop policy if exists leads_insert_anon on public.leads;
create policy leads_insert_anon on public.leads
  for insert to anon, authenticated with check (true);

drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads
  for select using (public.cc_is_admin());

-- ---------- 15. STORAGE bucket for crew photos ----------
insert into storage.buckets (id, name, public)
values ('service-photos', 'service-photos', true)
on conflict (id) do nothing;

drop policy if exists sp_staff_upload on storage.objects;
create policy sp_staff_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'service-photos' and public.cc_is_staff());

drop policy if exists sp_public_read on storage.objects;
create policy sp_public_read on storage.objects
  for select using (bucket_id = 'service-photos');

-- ---------- DONE ----------
-- Verify:
--   select public.cc_role();                       -- your role
--   select id, role from public.staff_roles;        -- admins/crew
