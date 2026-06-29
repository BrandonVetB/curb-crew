-- ============================================================
--  Cache geocoded coordinates on service_addresses
--  Lets the crew map plot instantly and share coordinates across
--  devices instead of re-geocoding per phone. The OS writes these
--  back the first time it geocodes an address (staff update RLS).
--  Additive + idempotent.
-- ============================================================
alter table public.service_addresses add column if not exists lat double precision;
alter table public.service_addresses add column if not exists lng double precision;

-- Optional: seed the Steiner Ranch test route so its map is instant
update public.service_addresses set lat=30.38123, lng=-97.87652 where line1='4600 Steiner Ranch Blvd'    and lat is null;
update public.service_addresses set lat=30.37768, lng=-97.88103 where line1='4204 Steiner Ranch Blvd'    and lat is null;
update public.service_addresses set lat=30.36238, lng=-97.89971 where line1='2601 Quinlan Park Rd'       and lat is null;
update public.service_addresses set lat=30.36940, lng=-97.90696 where line1='13100 Country Trails Ln'    and lat is null;
update public.service_addresses set lat=30.32837, lng=-97.92689 where line1='2418 Quinlan Park Rd'       and lat is null;
update public.service_addresses set lat=30.32025, lng=-97.92009 where line1='12166 Pleasant Panorama Vw' and lat is null;
