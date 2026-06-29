-- ============================================================
--  Curb Crew OS — Settings tab support
--  1. os_settings: single-row business config (company name,
--     support contact, service ZIPs) editable from the OS.
--  2. profiles.notify_email / notify_sms: per-user notification
--     preferences edited on the "My account" settings card.
--  Safe to run multiple times.
--  Depends on os-setup.sql (cc_is_admin / cc_is_staff helpers).
-- ============================================================
begin;

-- 1. Business settings (singleton row id = 1)
create table if not exists public.os_settings (
  id            int primary key default 1,
  company_name  text,
  support_email text,
  support_phone text,
  served_zips   text,
  updated_at    timestamptz not null default now(),
  constraint os_settings_singleton check (id = 1)
);
insert into public.os_settings (id) values (1) on conflict (id) do nothing;

alter table public.os_settings enable row level security;

drop policy if exists oss_admin_all on public.os_settings;
create policy oss_admin_all on public.os_settings
  for all using (public.cc_is_admin()) with check (public.cc_is_admin());

drop policy if exists oss_read_all on public.os_settings;
create policy oss_read_all on public.os_settings
  for select to anon, authenticated using (true);

-- 2. Notification preferences on profiles
alter table public.profiles add column if not exists notify_email boolean not null default true;
alter table public.profiles add column if not exists notify_sms  boolean not null default false;

commit;

-- Verify:
--   select * from public.os_settings;
--   select column_name from information_schema.columns
--   where table_name='profiles' and column_name in ('notify_email','notify_sms');
