-- ============================================================
--  Service neighborhoods (source of truth for the dropdowns)
--  Admin manages the list; everywhere a neighborhood is chosen
--  (invites, user editor, crew settings, onboarding) reads from here.
--  Seeded from neighborhoods already in use. Idempotent.
-- ============================================================
create table if not exists public.neighborhoods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.neighborhoods enable row level security;

drop policy if exists nb_read on public.neighborhoods;
create policy nb_read on public.neighborhoods for select to anon, authenticated using (true);

drop policy if exists nb_admin_all on public.neighborhoods;
create policy nb_admin_all on public.neighborhoods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed from neighborhoods already entered on crew profiles and invites
insert into public.neighborhoods (name)
select distinct trim(neighborhood) from public.profiles
where neighborhood is not null and trim(neighborhood) <> '' and trim(neighborhood) not ilike '%test%'
on conflict (name) do nothing;

insert into public.neighborhoods (name)
select distinct trim(neighborhood) from public.crew_invites
where neighborhood is not null and trim(neighborhood) <> '' and trim(neighborhood) not ilike '%test%'
on conflict (name) do nothing;

insert into public.neighborhoods (name) values ('Steiner Ranch') on conflict (name) do nothing;
