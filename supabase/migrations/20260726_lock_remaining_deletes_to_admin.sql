-- Applied to the live project 2026-07-26 (migration: lock_remaining_deletes_to_admin). Per Jake.
--
-- Each of these tables had a single blanket "any signed-in user, full access" policy, and "full
-- access" quietly included DELETE. Split so reading, adding and editing stay open to all staff,
-- and only deleting needs an admin.
--
-- KEPT deletable on purpose:
--   crew_blocks, jwg_schedules, jwg_workshop_tasks — the schedule is the office's to build
--   jwg_inventory_items, jwg_inventory_categories — Darrin's kiosk runs on a non-admin account
--   push_subscriptions — each person's own device registration only
--
-- The cron jobs and edge functions that write telemetry, driver scores and geofence rows use the
-- service key, which bypasses RLS entirely, so none of them are affected by this.

drop policy "Allow authenticated full access to bin_history" on bin_history;
create policy "bin_history_rw" on bin_history for select to authenticated using (true);
create policy "bin_history_insert" on bin_history for insert to authenticated with check (true);
create policy "bin_history_update" on bin_history for update to authenticated using (true);
create policy "bin_history_delete" on bin_history for delete to authenticated using (public.is_admin());

drop policy "authenticated_all" on city_drive_times;
create policy "city_drive_times_read" on city_drive_times for select to authenticated using (true);
create policy "city_drive_times_insert" on city_drive_times for insert to authenticated with check (true);
create policy "city_drive_times_update" on city_drive_times for update to authenticated using (true);
create policy "city_drive_times_delete" on city_drive_times for delete to authenticated using (public.is_admin());

drop policy "crew_driver_scores_all" on crew_driver_scores;
create policy "crew_driver_scores_read" on crew_driver_scores for select to authenticated using (true);
create policy "crew_driver_scores_insert" on crew_driver_scores for insert to authenticated with check (true);
create policy "crew_driver_scores_update" on crew_driver_scores for update to authenticated using (true);
create policy "crew_driver_scores_delete" on crew_driver_scores for delete to authenticated using (public.is_admin());

drop policy "safety_events_all" on safety_events;
create policy "safety_events_read" on safety_events for select to authenticated using (true);
create policy "safety_events_insert" on safety_events for insert to authenticated with check (true);
create policy "safety_events_update" on safety_events for update to authenticated using (true);
create policy "safety_events_delete" on safety_events for delete to authenticated using (public.is_admin());

drop policy "authenticated_all" on geofences;
create policy "geofences_read" on geofences for select to authenticated using (true);
create policy "geofences_insert" on geofences for insert to authenticated with check (true);
create policy "geofences_update" on geofences for update to authenticated using (true);
create policy "geofences_delete" on geofences for delete to authenticated using (public.is_admin());

drop policy "authenticated_all" on geofence_notifications;
create policy "geofence_notifications_read" on geofence_notifications for select to authenticated using (true);
create policy "geofence_notifications_insert" on geofence_notifications for insert to authenticated with check (true);
create policy "geofence_notifications_update" on geofence_notifications for update to authenticated using (true);
create policy "geofence_notifications_delete" on geofence_notifications for delete to authenticated using (public.is_admin());

drop policy "authenticated_all" on geofence_poll_state;
create policy "geofence_poll_state_read" on geofence_poll_state for select to authenticated using (true);
create policy "geofence_poll_state_insert" on geofence_poll_state for insert to authenticated with check (true);
create policy "geofence_poll_state_update" on geofence_poll_state for update to authenticated using (true);
create policy "geofence_poll_state_delete" on geofence_poll_state for delete to authenticated using (public.is_admin());

-- app-suggestions.js already limits taking a note down to Jake; this makes it a rule
drop policy "suggestions auth all" on suggestions;
create policy "suggestions_read" on suggestions for select to authenticated using (true);
create policy "suggestions_insert" on suggestions for insert to authenticated with check (true);
create policy "suggestions_update" on suggestions for update to authenticated using (true);
create policy "suggestions_delete" on suggestions for delete to authenticated using (public.is_admin());

drop policy "jwg auth all" on jwg_salt_bins;
create policy "jwg_salt_bins_read" on jwg_salt_bins for select to authenticated using (true);
create policy "jwg_salt_bins_insert" on jwg_salt_bins for insert to authenticated with check (true);
create policy "jwg_salt_bins_update" on jwg_salt_bins for update to authenticated using (true);
create policy "jwg_salt_bins_delete" on jwg_salt_bins for delete to authenticated using (public.is_admin());

drop policy "jwg auth all" on jwg_employee_clothing;
create policy "jwg_employee_clothing_read" on jwg_employee_clothing for select to authenticated using (true);
create policy "jwg_employee_clothing_insert" on jwg_employee_clothing for insert to authenticated with check (true);
create policy "jwg_employee_clothing_update" on jwg_employee_clothing for update to authenticated using (true);
create policy "jwg_employee_clothing_delete" on jwg_employee_clothing for delete to authenticated using (public.is_admin());

drop policy "jwg auth all" on jwg_app_settings;
create policy "jwg_app_settings_read" on jwg_app_settings for select to authenticated using (true);
create policy "jwg_app_settings_insert" on jwg_app_settings for insert to authenticated with check (true);
create policy "jwg_app_settings_update" on jwg_app_settings for update to authenticated using (true);
create policy "jwg_app_settings_delete" on jwg_app_settings for delete to authenticated using (public.is_admin());
