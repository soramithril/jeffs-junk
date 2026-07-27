-- Applied to the live project 2026-07-26 (migration: require_sign_in_for_internal_tables).
--
-- Nine tables were readable and writable by anyone on the internet, signed in or not: their
-- policies were granted TO public with USING (true). The July 2 lockdown had closed jobs and
-- clients but left these behind. The worst was quote_correspondence, which holds the recipient,
-- subject and full body of every quote and confirmation email sent to a customer.
--
-- Verified safe before applying: office-tv.html and inventory.html sign in with their own
-- accounts, the dashboard signs in, and jeff.html calls toDashboardLogin() when getSession()
-- returns nothing (jeff.html:776-784) — so no internal page ever queries these anonymously.
--
-- DELIBERATELY LEFT OPEN for the public booking form (which lives outside this repository):
--   jobs_insert, clients_insert, referral_sources select + insert.
-- Delete policies were not touched — they already require user_profiles.can_delete.
--
-- After applying, the only policies still open to anonymous callers are those four.

-- Customer email archive: recipient, subject and full message body.
drop policy "quote_correspondence_select" on quote_correspondence;
create policy "quote_correspondence_select" on quote_correspondence for select to authenticated using (true);
drop policy "quote_correspondence_insert" on quote_correspondence;
create policy "quote_correspondence_insert" on quote_correspondence for insert to authenticated with check (true);
drop policy "quote_correspondence_update" on quote_correspondence;
create policy "quote_correspondence_update" on quote_correspondence for update to authenticated using (true);

-- Staff records
drop policy "crew_members_select" on crew_members;
create policy "crew_members_select" on crew_members for select to authenticated using (true);
drop policy "crew_members_insert" on crew_members;
create policy "crew_members_insert" on crew_members for insert to authenticated with check (true);
drop policy "crew_members_update" on crew_members;
create policy "crew_members_update" on crew_members for update to authenticated using (true);

-- Fleet / crew operations
drop policy "vehicle_assignments_select" on vehicle_assignments;
create policy "vehicle_assignments_select" on vehicle_assignments for select to authenticated using (true);
drop policy "vehicle_assignments_insert" on vehicle_assignments;
create policy "vehicle_assignments_insert" on vehicle_assignments for insert to authenticated with check (true);
drop policy "vehicle_assignments_update" on vehicle_assignments;
create policy "vehicle_assignments_update" on vehicle_assignments for update to authenticated using (true);

drop policy "driver_scores_select" on driver_scores;
create policy "driver_scores_select" on driver_scores for select to authenticated using (true);
drop policy "driver_scores_insert" on driver_scores;
create policy "driver_scores_insert" on driver_scores for insert to authenticated with check (true);
drop policy "driver_scores_update" on driver_scores;
create policy "driver_scores_update" on driver_scores for update to authenticated using (true);

drop policy "maintenance_schedules_select" on maintenance_schedules;
create policy "maintenance_schedules_select" on maintenance_schedules for select to authenticated using (true);
drop policy "maintenance_schedules_insert" on maintenance_schedules;
create policy "maintenance_schedules_insert" on maintenance_schedules for insert to authenticated with check (true);
drop policy "maintenance_schedules_update" on maintenance_schedules;
create policy "maintenance_schedules_update" on maintenance_schedules for update to authenticated using (true);

drop policy "vehicle_odometers_select" on vehicle_odometers;
create policy "vehicle_odometers_select" on vehicle_odometers for select to authenticated using (true);
drop policy "vehicle_odometers_insert" on vehicle_odometers;
create policy "vehicle_odometers_insert" on vehicle_odometers for insert to authenticated with check (true);
drop policy "vehicle_odometers_update" on vehicle_odometers;
create policy "vehicle_odometers_update" on vehicle_odometers for update to authenticated using (true);

drop policy "vehicles_select" on vehicles;
create policy "vehicles_select" on vehicles for select to authenticated using (true);

-- Single blanket ALL policies
drop policy "Allow all for safety_events" on safety_events;
create policy "safety_events_all" on safety_events for all to authenticated using (true) with check (true);

drop policy "Allow all for crew_driver_scores" on crew_driver_scores;
create policy "crew_driver_scores_all" on crew_driver_scores for all to authenticated using (true) with check (true);
