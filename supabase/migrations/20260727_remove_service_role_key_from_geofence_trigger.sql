-- Applied to the live project 2026-07-27 (migration: remove_service_role_key_from_geofence_trigger).
--
-- invoke_geofence_sync() fires on every jobs INSERT/UPDATE/DELETE and called the geofence-sync
-- edge function with the service_role key in an Authorization header. That key bypasses every
-- access rule in the database, and it had been committed to this PUBLIC repository since
-- 2026-04-02 (commit 42e9127) — still fetchable anonymously from the repo's history.
--
-- The header was never needed. geofence-sync is deployed with verify_jwt = false, so it does not
-- read the Authorization header at all. The proof was already here: the geofence-morning-sync and
-- geofence-nightly-cleanup cron jobs call the same function with only a Content-Type header and
-- have worked for months.
--
-- After this, no function and no cron job in the database holds the master key. Everything else
-- that sends a key (geofence-events-poll, geofence-events-sat, daily-bins-push,
-- notify_new_junk_quote) sends the PUBLIC anon key, which is designed to be public.
--
-- The key was also stripped from the four migration files in the same commit. It CANNOT be removed
-- from git history, so it must still be rotated in the Supabase dashboard — but rotating it now
-- breaks nothing, which was the point of doing this first.
--
-- Function body is otherwise byte-identical to the version that was running.

CREATE OR REPLACE FUNCTION public.invoke_geofence_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  payload JSONB;
  job_row RECORD;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    job_row := OLD;
  ELSE
    job_row := NEW;
  END IF;

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
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload
  );

  RETURN job_row;
END;
$function$;
