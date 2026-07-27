-- Daily defensive sweep of BIN_AUTO_ Geotab zones.
--
-- Lists every BIN_AUTO_ zone in the "Bin Rentals" group and removes any whose
-- activeTo is in the past, plus dedupes same-name survivors. Runs even when our
-- `geofences` table state has drifted from Geotab. Complements the per-job
-- removal in handleJobChange (terminal status) and the 2:00 UTC nuclear nightly
-- cleanup; this fires at 14:00 UTC (~10am EDT) to catch zones that expired
-- since the morning sync.

SELECT cron.schedule(
  'geofence-expiry-sweep',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/geofence-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <<SERVICE_ROLE_KEY_REMOVED_2026-07-27>>'
    ),
    body := '{"action": "expiry-sweep"}'
  );
  $$
);
