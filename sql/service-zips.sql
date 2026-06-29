-- ============================================================
--  Service ZIP codes, grouped under neighborhoods.
--  Each neighborhood (service area) holds the ZIP codes it covers.
--  "Serviced ZIPs" = all active service_zips. Admin manages them in
--  Settings; crew are assigned to neighborhoods (groups of ZIPs).
--  Requires neighborhoods.sql first. Idempotent.
-- ============================================================
create table if not exists public.service_zips (
  id              uuid primary key default gen_random_uuid(),
  zip             text not null,
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (zip)
);
create index if not exists service_zips_hood_idx on public.service_zips (neighborhood_id);

alter table public.service_zips enable row level security;

drop policy if exists sz_read on public.service_zips;
create policy sz_read on public.service_zips for select to anon, authenticated using (true);

drop policy if exists sz_admin_all on public.service_zips;
create policy sz_admin_all on public.service_zips for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed from ZIPs already serving active customers, mapped to a neighborhood
-- when one obviously matches (Steiner Ranch = 78732). Others land unassigned
-- and you can group them in Settings.
insert into public.service_zips (zip, neighborhood_id)
select '78732', (select id from public.neighborhoods where lower(name)='steiner ranch' limit 1)
on conflict (zip) do nothing;
