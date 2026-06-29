-- ============================================================
--  Prospect follow-up tracking on leads.
--  Adds contacted_at + last_template, and lets admins/leads update
--  leads (to record outreach). Additive + idempotent.
-- ============================================================
alter table public.leads add column if not exists contacted_at  timestamptz;
alter table public.leads add column if not exists last_template text;

drop policy if exists leads_staff_update on public.leads;
create policy leads_staff_update on public.leads
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- (read policy for staff so the OS can list leads, if not already present)
drop policy if exists leads_staff_read on public.leads;
create policy leads_staff_read on public.leads
  for select to authenticated using (public.is_staff());
