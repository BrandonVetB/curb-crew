-- ============================================================
--  Role-guard bypass for onboarding — v2 (no transaction wrapper,
--  drop+create accept_crew_invite to avoid param-name conflicts),
--  and a fresh test invite. Run the whole thing.
-- ============================================================

-- 1. Guard honors a transaction-local bypass flag
create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and coalesce(current_setting('app.allow_privileged_profile_change', true), '') <> 'on' then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change a user role';
    end if;
    if new.manager_id is distinct from old.manager_id then
      raise exception 'Only admins can change reporting lines';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Recreate accept_crew_invite (drop first to dodge any param-name change error)
drop function if exists public.accept_crew_invite(text,text,text,text,text,text,text,text,text,text);

create function public.accept_crew_invite(
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

-- 3. Fresh test invite (a new +alias so signup is clean)
insert into public.crew_invites (email, token, role, neighborhood, invited_by)
values ('ryanoarnold44+try@gmail.com', 'trycurbcrews', 'crew_lead', 'Steiner Ranch',
        (select id from public.profiles where role='admin' limit 1))
on conflict (token) do nothing;

-- Confirm both now have the bypass:
select proname, (prosrc ilike '%allow_privileged_profile_change%') as has_bypass
from pg_proc where proname in ('guard_profile_privileged_cols','accept_crew_invite');
