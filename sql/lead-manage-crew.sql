-- ============================================================
--  Neighborhood lead crew management
--  set_crew_active: an admin (anyone) or a crew_lead (only crew_members
--  in their own neighborhood) can activate/deactivate a crew member.
--  SECURITY DEFINER so it can flip is_active without a broad update
--  policy; it cannot touch role (and leads can't target other leads).
-- ============================================================
create or replace function public.set_crew_active(p_target uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me_role public.app_role; v_me_hood text;
  v_t_role  public.app_role; v_t_hood  text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select role, neighborhood into v_me_role, v_me_hood from public.profiles where id = auth.uid();
  select role, neighborhood into v_t_role,  v_t_hood  from public.profiles where id = p_target;
  if v_t_role is null then raise exception 'No such user'; end if;

  if v_me_role = 'admin'
     or (v_me_role = 'crew_lead' and v_t_role = 'crew_member' and v_me_hood is not distinct from v_t_hood) then
    update public.profiles set is_active = p_active where id = p_target;
  else
    raise exception 'Not allowed';
  end if;
end;
$$;
revoke all on function public.set_crew_active(uuid, boolean) from public;
grant execute on function public.set_crew_active(uuid, boolean) to authenticated;
