-- ============================================================
--  Remove ALL verification/test data created during the build.
--  Review before running. Run in the Supabase SQL editor.
-- ============================================================

-- 1. Test service events + photos (prospect/test markers)
delete from public.service_photos
where service_event_id in (select id from public.service_events where crew ilike '%TEST%' or notes ilike 'TEST%');
delete from public.service_events where crew ilike '%TEST%' or notes ilike 'TEST%';

-- 2. Steiner Ranch test route (route + its assignments + pickups + the 6 test homes)
delete from public.pickups
where address_id in (
  select sa.id from public.service_addresses sa
  join public.profiles p on p.id = sa.profile_id
  where p.email ilike 'ryanoarnold44@gmail.com' and sa.zip = '78732' and sa.is_prospect = false
);
delete from public.address_assignments where route_id in (select id from public.routes where name ilike '%(TEST)%');
delete from public.routes where name ilike '%(TEST)%';
delete from public.service_addresses sa
using public.profiles p
where sa.profile_id = p.id and p.email ilike 'ryanoarnold44@gmail.com'
  and sa.zip = '78732' and sa.is_prospect = false;

-- 3. Test invites
delete from public.crew_invites
where token like 'e2e%' or token like 'guard%' or token = 'trycurbcrews'
   or neighborhood ilike '%TEST%' or email ilike 'ryanoarnold44+%@gmail.com';

-- 4. Test crew accounts (deleting the auth user cascades its profile)
delete from auth.users
where email ilike 'ryanoarnold44+crew%@gmail.com'
   or email ilike 'ryanoarnold44+guard%@gmail.com'
   or email ilike 'ryanoarnold44+try%@gmail.com';

-- 5. Clear the Stripe account attached to your own profile during testing
update public.profiles set stripe_account_id = null where email ilike 'ryanoarnold44@gmail.com';

-- Verify nothing test-y remains:
--   select count(*) from public.routes where name ilike '%(TEST)%';
--   select count(*) from public.crew_invites where neighborhood ilike '%TEST%';
