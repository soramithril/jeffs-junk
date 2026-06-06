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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NjI3MSwiZXhwIjoyMDg4MjIyMjcxfQ.Yllfty1DTqwAAfLlP_svB0rPfLoHXH7GwECBS-SUQq0'
    ),
    body := '{"action": "expiry-sweep"}'
  );
  $$
);
