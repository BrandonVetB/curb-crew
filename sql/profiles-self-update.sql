-- ============================================================
--  Allow a signed-in user to update their OWN profile.
--  The guard_profile_privileged_cols trigger still blocks non-admins
--  from changing role / manager_id, so this is safe: crew can edit
--  their name, phone, photo, availability, emergency contact, and
--  notification prefs, but not escalate privileges.
-- ============================================================
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
