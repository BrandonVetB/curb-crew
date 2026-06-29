-- ============================================================
--  Remove onboarding verification test data
--  Run in the Supabase SQL editor when ready.
-- ============================================================
delete from public.crew_invites
where email ilike 'ryanoarnold44+crew%@gmail.com'
   or neighborhood ilike '%TEST%';

-- Deleting the auth user cascades to its profiles row (FK on delete cascade).
delete from auth.users
where email ilike 'ryanoarnold44+crewe2e%@gmail.com'
   or email ilike 'ryanoarnold44+crewtest%@gmail.com';
