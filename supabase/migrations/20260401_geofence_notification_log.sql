-- Notification log for geofence drop/pickup events.
-- Persists notifications so they can be loaded on dashboard open.

CREATE TABLE geofence_notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('dropped', 'pickedup')),
  customer_name TEXT,
  bin_bid     TEXT,
  address     TEXT,
  city        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_geofence_notifications_created ON geofence_notifications (created_at DESC);

-- Auto-delete notifications older than 48 hours (runs daily at 3am EDT / 7am UTC)
SELECT cron.schedule(
  'cleanup-old-geofence-notifications',
  '0 7 * * *',
  $$DELETE FROM geofence_notifications WHERE created_at < now() - interval '48 hours';$$
);

-- 10pm EDT nightly cleanup: delete stale geofences from Geotab
-- 10pm EDT = 2:00 UTC (adjust for EST: 3:00 UTC)
SELECT cron.schedule(
  'geofence-nightly-cleanup',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/geofence-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NjI3MSwiZXhwIjoyMDg4MjIyMjcxfQ.Yllfty1DTqwAAfLlP_svB0rPfLoHXH7GwECBS-SUQq0'
    ),
    body := '{"action": "nightly-cleanup"}'
  );
  $$
);

-- Enable realtime for geofence_notifications so dashboard can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE geofence_notifications;
