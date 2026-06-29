-- ============================================================
--  Find the role-change guard blocking accept_crew_invite
--  ("Only admins can change a user role"). Paste both results.
-- ============================================================

-- A. The function that raises the guard (with its body to patch)
select n.nspname as schema, p.proname as fn, p.prosrc as body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosrc ilike '%change a user role%';

-- B. Triggers on public.profiles and the function each calls
select t.tgname as trigger_name, p.proname as fn_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
