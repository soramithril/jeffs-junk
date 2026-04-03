-- Tracks auto-created Geotab geofences linked to jobs.
-- Used to map job_id -> Geotab zone_id for cleanup.

CREATE TABLE geofences (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      TEXT NOT NULL UNIQUE,
  zone_id     TEXT NOT NULL,
  zone_name   TEXT NOT NULL,
  address     TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_geofences_job_id ON geofences (job_id);
CREATE INDEX idx_geofences_zone_name ON geofences (zone_name);

-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: calls the geofence-sync edge function via HTTP
-- on every job INSERT, UPDATE, or DELETE.
CREATE OR REPLACE FUNCTION invoke_geofence_sync()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  job_row RECORD;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    job_row := OLD;
  ELSE
    job_row := NEW;
  END IF;

  -- Only fire for jobs with an address
  IF (job_row.address IS NULL OR job_row.address = '') THEN
    RETURN job_row;
  END IF;

  payload := jsonb_build_object(
    'action', 'job-change',
    'event', TG_OP,
    'job', jsonb_build_object(
      'job_id', job_row.job_id,
      'service', job_row.service,
      'status', job_row.status,
      'date', job_row.date,
      'address', job_row.address,
      'city', job_row.city,
      'bin_dropoff', job_row.bin_dropoff,
      'bin_pickup', job_row.bin_pickup
    )
  );

  PERFORM net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/geofence-sync'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NjI3MSwiZXhwIjoyMDg4MjIyMjcxfQ.Yllfty1DTqwAAfLlP_svB0rPfLoHXH7GwECBS-SUQq0'
    ),
    body := payload
  );

  RETURN job_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_geofence_job_change
  AFTER INSERT OR UPDATE OR DELETE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION invoke_geofence_sync();

-- Enable pg_cron for the morning sync schedule
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 6am EDT = 10:00 UTC (adjust for EST: 11:00 UTC)
SELECT cron.schedule(
  'geofence-morning-sync',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/geofence-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NjI3MSwiZXhwIjoyMDg4MjIyMjcxfQ.Yllfty1DTqwAAfLlP_svB0rPfLoHXH7GwECBS-SUQq0'
    ),
    body := '{"action": "morning-sync"}'
  );
  $$
);

-- ============================================================
-- Event poller: tracks GetFeed version for ExceptionEvents
-- ============================================================

CREATE TABLE geofence_poll_state (
  key   TEXT PRIMARY KEY DEFAULT 'feed_version',
  value TEXT NOT NULL DEFAULT '0000000000000000'
);
INSERT INTO geofence_poll_state (key, value) VALUES ('feed_version', '0000000000000000');

-- Poll Geotab every 2 minutes for zone entry/exit events
SELECT cron.schedule(
  'geofence-events-poll',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/geofence-events'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NjI3MSwiZXhwIjoyMDg4MjIyMjcxfQ.Yllfty1DTqwAAfLlP_svB0rPfLoHXH7GwECBS-SUQq0'
    ),
    body := '{"poll": true}'::jsonb
  );
  $$
);
