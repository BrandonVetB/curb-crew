-- ============================================================
--  Curb Crew OS — Phase 0.1: clear demo data
--  Removes test crew, the Test Customer and everything tied to
--  it, demo service events with no crew attached, and leftover
--  homepage leads. Keeps real admins, routes, and config.
--  Runs in a transaction: any FK error rolls the whole thing back.
--  Safe to run once; re-running is a no-op.
-- ============================================================
begin;

-- 1. Test crew accounts (staff_roles keyed by email)
delete from public.staff_roles where email in (
  'workeronetest24852@gmail.com',
  'workertwotest9845093846@gmail.com',
  'bradytest3249573490513@gmail.com',
  'jdtest93864982352750@gmail.com'
);

-- 2. Demo service events with no crew attribution (the "Team 7"/"Test Crew" seed rows)
delete from public.service_events where crew_member_id is null;

-- 3. Test Customer + everything tied to that profile (children first for FKs)
--    Test Customer profile id:
--      1548e202-e8e9-4058-b02b-cfc16c30ccba
delete from public.service_events
  where profile_id = '1548e202-e8e9-4058-b02b-cfc16c30ccba';
delete from public.invoices
  where profile_id = '1548e202-e8e9-4058-b02b-cfc16c30ccba';
delete from public.pickups
  where profile_id = '1548e202-e8e9-4058-b02b-cfc16c30ccba';
delete from public.address_assignments
  where address_id in (
    select id from public.service_addresses
    where profile_id = '1548e202-e8e9-4058-b02b-cfc16c30ccba'
  );
delete from public.service_addresses
  where profile_id = '1548e202-e8e9-4058-b02b-cfc16c30ccba';
delete from public.subscriptions
  where profile_id = '1548e202-e8e9-4058-b02b-cfc16c30ccba';
delete from public.profiles
  where id = '1548e202-e8e9-4058-b02b-cfc16c30ccba';

-- 4. Leftover homepage waitlist leads
delete from public.leads;

commit;

-- Verify after running:
--   select count(*) from public.leads;                 -- expect 0
--   select email, role from public.staff_roles order by role;  -- only real admins/crew
--   select full_name, email from public.profiles;      -- no "Test Customer"
