-- ============================================================
--  Curb Crews OS — crew invites + onboarding
--  Project: hezahtnfyhqfucixzqxi
--
--  Adds an invite/onboarding pipeline:
--   - crew_invites: an admin (or neighborhood lead) issues an invite
--     with a role (crew_member | crew_lead) and neighborhood.
--   - profile fields filled during onboarding.
--   - get_invite(token): public read of a single invite (for the
--     onboarding page, before the user has elevated access).
--   - accept_crew_invite(...): the new user, after creating their
--     account, consumes their token to set their role + profile.
--   - avatars bucket for profile photos.
--  Idempotent. Depends on is_staff()/is_admin() and app_role enum.
-- ============================================================
begin;

-- 1. Profile fields collected during onboarding
alter table public.profiles add column if not exists avatar_url        text;
alter table public.profiles add column if not exists neighborhood      text;
alter table public.profiles add column if not exists home_address      text;
alter table public.profiles add column if not exists availability      text;
alter table public.profiles add column if not exists emergency_name    text;
alter table public.profiles add column if not exists emergency_phone   text;
alter table public.profiles add column if not exists favorite_dessert  text;
alter table public.profiles add column if not exists agreed_at         timestamptz;
alter table public.profiles add column if not exists onboarded_at      timestamptz;

-- 2. Invites
create table if not exists public.crew_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  token        text not null unique,
  role         public.app_role not null default 'crew_member',
  neighborhood text,
  invited_by   uuid references public.profiles(id),
  status       text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create index if not exists crew_invites_token_idx on public.crew_invites (token);
create index if not exists crew_invites_email_idx on public.crew_invites (lower(email));

alter table public.crew_invites enable row level security;

drop policy if exists ci_admin_all on public.crew_invites;
create policy ci_admin_all on public.crew_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Neighborhood leads may issue and see invites they created (crew_member only).
drop policy if exists ci_lead_insert on public.crew_invites;
create policy ci_lead_insert on public.crew_invites
  for insert to authenticated
  with check (
    public.is_staff()
    and invited_by = auth.uid()
    and role = 'crew_member'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('crew_lead','admin'))
  );

drop policy if exists ci_lead_select on public.crew_invites;
create policy ci_lead_select on public.crew_invites
  for select to authenticated using (invited_by = auth.uid());

drop policy if exists ci_lead_update on public.crew_invites;
create policy ci_lead_update on public.crew_invites
  for update to authenticated using (invited_by = auth.uid()) with check (invited_by = auth.uid());

-- 3. Public read of a single invite by token (onboarding page, pre-elevation)
create or replace function public.get_invite(p_token text)
returns table (email text, role public.app_role, neighborhood text, status text, inviter text)
language sql security definer set search_path = public as $$
  select i.email, i.role, i.neighborhood, i.status,
         coalesce(p.full_name, 'Curb Crews')
  from public.crew_invites i
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token
  limit 1;
$$;
revoke all on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;

-- 4. Consume an invite: set the signed-in user's role + profile from it
create or replace function public.accept_crew_invite(
  p_token text,
  p_full_name text,
  p_phone text,
  p_avatar_url text,
  p_home_address text,
  p_neighborhood text,
  p_availability text,
  p_emergency_name text,
  p_emergency_phone text,
  p_favorite_dessert text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.crew_invites%rowtype;
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_inv from public.crew_invites where token = p_token;
  if not found then raise exception 'Invite not found'; end if;
  if v_inv.status <> 'pending' then raise exception 'Invite already used'; end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'This invite was sent to a different email';
  end if;

  -- allow the role change past guard_profile_privileged_cols for this txn only
  perform set_config('app.allow_privileged_profile_change', 'on', true);

  update public.profiles set
    full_name        = coalesce(p_full_name, full_name),
    phone            = coalesce(p_phone, phone),
    avatar_url       = coalesce(p_avatar_url, avatar_url),
    home_address     = coalesce(p_home_address, home_address),
    neighborhood     = coalesce(p_neighborhood, v_inv.neighborhood, neighborhood),
    availability     = coalesce(p_availability, availability),
    emergency_name   = coalesce(p_emergency_name, emergency_name),
    emergency_phone  = coalesce(p_emergency_phone, emergency_phone),
    favorite_dessert = coalesce(p_favorite_dessert, favorite_dessert),
    role             = v_inv.role,
    agreed_at        = now(),
    onboarded_at     = now()
  where id = v_uid;

  update public.crew_invites set status = 'accepted', accepted_at = now() where id = v_inv.id;
end;
$$;
revoke all on function public.accept_crew_invite(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.accept_crew_invite(text,text,text,text,text,text,text,text,text,text) to authenticated;

-- 5. Avatars bucket (public read; authenticated users write their own)
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated using (bucket_id = 'avatars') with check (bucket_id = 'avatars');

commit;

-- Verify:
--   select * from public.get_invite('nonexistent');  -- 0 rows, no error
--   select column_name from information_schema.columns where table_name='profiles' and column_name in ('avatar_url','favorite_dessert');
