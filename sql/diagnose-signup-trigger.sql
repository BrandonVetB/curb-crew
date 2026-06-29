-- ============================================================
--  Diagnose "Database error saving new user" on signup
--  Run each query, paste the output. Uses prosrc (safe; avoids
--  pg_get_functiondef erroring on aggregate functions).
-- ============================================================

-- A. Triggers on auth.users and the function each calls
select t.tgname as trigger_name, n.nspname as fn_schema, p.proname as fn_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- B. THE KEY ONE: any function whose body references the dropped staff_roles,
--    with its full body so I can see exactly what to patch.
select n.nspname as schema, p.proname as fn, p.prosrc as body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosrc ilike '%staff_roles%';

-- C. Body of the usual new-user handler (in case it's not in B)
select proname, prosrc
from pg_proc
where proname in ('handle_new_user','create_profile_for_user','on_auth_user_created');
