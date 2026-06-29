-- ============================================================
--  TEST: a Steiner Ranch route that shows up in the crew app
--  Creates a route, 6 real Steiner Ranch homes (with cached
--  coordinates), assigns them to you, and drops today's pickups
--  so they appear on your Route + Map tabs.
--  Run in the Supabase SQL editor. Remove later with the cleanup
--  block at the bottom.
-- ============================================================

with v as (
  select '6d3b33ef-7af4-43a4-9406-b16da5b7cf7f'::uuid as uid   -- ryanoarnold44@gmail.com
),
r as (
  insert into public.routes (name, zone, pickup_day, lead_id, active)
  select 'Steiner Ranch AM (TEST)', '78732', to_char(current_date,'FMDay'), uid, true from v
  returning id
),
addr as (
  insert into public.service_addresses (profile_id, line1, city, state, zip, is_prospect, pickup_day)
  select v.uid, x.line1, 'Austin', 'TX', '78732', false, to_char(current_date,'FMDay')
  from v, (values
    ('4600 Steiner Ranch Blvd'),
    ('4204 Steiner Ranch Blvd'),
    ('2601 Quinlan Park Rd'),
    ('13100 Country Trails Ln'),
    ('2418 Quinlan Park Rd'),
    ('12166 Pleasant Panorama Vw')
  ) as x(line1)
  returning id
),
asg as (
  insert into public.address_assignments (route_id, address_id, assigned_to, cans)
  select (select id from r), addr.id, (select uid from v), 2 from addr
  returning address_id
)
insert into public.pickups (profile_id, address_id, pickup_date, out_night, status, types, is_holiday_shift)
select (select uid from v), asg.address_id, current_date, current_date - 1, 'scheduled',
       array['trash','recycling']::public.pickup_type[], false
from asg;

-- ============================================================
-- CLEANUP (run later to remove the test route + homes)
-- ============================================================
-- delete from public.pickups            where address_id in (select id from public.service_addresses where line1 like '%(TEST)%' or (city='Austin' and zip='78732' and profile_id='6d3b33ef-7af4-43a4-9406-b16da5b7cf7f'));
-- delete from public.address_assignments where route_id in (select id from public.routes where name like '%(TEST)%');
-- delete from public.routes             where name like '%(TEST)%';
-- delete from public.service_addresses  where profile_id='6d3b33ef-7af4-43a4-9406-b16da5b7cf7f' and zip='78732';
