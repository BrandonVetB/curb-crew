-- ============================================================
--  Unify ZIP management onto served_zips (the table the website's
--  serve-check already reads). The OS Settings manager now writes
--  here, so adding a ZIP in the OS instantly makes the website serve
--  it. Adds neighborhood grouping + admin write policy, migrates the
--  OS-only service_zips rows, then drops service_zips.
--  Requires neighborhoods.sql. Idempotent.
-- ============================================================
-- group ZIPs under a neighborhood
alter table public.served_zips add column if not exists neighborhood_id uuid references public.neighborhoods(id) on delete set null;

-- make zip uniquely upsertable
create unique index if not exists served_zips_zip_uidx on public.served_zips (zip);

-- RLS: everyone reads (website check), admins manage (OS Settings)
alter table public.served_zips enable row level security;
drop policy if exists szz_read on public.served_zips;
create policy szz_read on public.served_zips for select to anon, authenticated using (true);
drop policy if exists szz_admin_all on public.served_zips;
create policy szz_admin_all on public.served_zips for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- migrate rows from the OS-only service_zips table if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='service_zips') then
    insert into public.served_zips (zip, neighborhood_id, active, label)
    select sz.zip, sz.neighborhood_id, coalesce(sz.active, true), n.name
    from public.service_zips sz left join public.neighborhoods n on n.id = sz.neighborhood_id
    on conflict (zip) do update set neighborhood_id = excluded.neighborhood_id, active = excluded.active,
                                     label = coalesce(excluded.label, public.served_zips.label);
    drop table public.service_zips;
  end if;
end $$;

-- label = neighborhood name where missing
update public.served_zips sz set label = n.name
from public.neighborhoods n where sz.neighborhood_id = n.id and (sz.label is null or sz.label = '');
