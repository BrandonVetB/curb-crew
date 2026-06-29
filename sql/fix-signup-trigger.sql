-- ============================================================
--  Fix "Database error saving new user" on signup
--  Project: hezahtnfyhqfucixzqxi   Date: 2026-06-27
--
--  handle_new_user() looked up the now-dropped staff_roles table,
--  so every auth signup (customers AND crew) was failing. Identity
--  now lives on profiles.role: new users default to 'customer', and
--  crew are elevated by accept_crew_invite(). This rewrites the
--  trigger function to just create the profile row. The trigger on
--  auth.users already points at this function, so no trigger change.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'customer'::public.app_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Verify (should return a session-less user with no error):
--   select public.handle_new_user;  -- function exists
