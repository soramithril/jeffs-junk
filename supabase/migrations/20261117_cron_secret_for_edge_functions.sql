-- 2026-11-17: only the database may call the four database-driven edge functions.
--
-- geofence-sync, geofence-events, cut-times-sync and vehicle-telemetry are deployed
-- with verify_jwt = false (the legacy JWT keys are switched off, so pg_cron has no
-- token to send) and had no caller check of their own, so anyone on the internet
-- could call them — including geofence-sync's nightly-cleanup, which deletes every
-- truck zone.
--
-- One shared secret now lives in public.cron_config. Every database caller sends it
-- in the x-cron-secret header, and each of the four functions reads the same row
-- with its SB_SECRET_KEY client and answers 401 to anything that does not match.
--
-- The secret is generated here, in SQL, and is never printed. To rotate it:
--   update public.cron_config
--      set value = encode(extensions.gen_random_bytes(32), 'hex')
--    where key = 'edge_secret';
-- Nothing else needs to change — callers and functions both read the row each time.

-- 1. The secret ---------------------------------------------------------------

create table public.cron_config (
  key   text primary key,
  value text not null
);

-- RLS on with NO policies: only postgres (pg_cron, security-definer functions) and
-- the service/secret key (the edge functions) can read it.
alter table public.cron_config enable row level security;
revoke all on public.cron_config from anon, authenticated;
grant select on public.cron_config to service_role;

insert into public.cron_config (key, value)
values ('edge_secret', encode(extensions.gen_random_bytes(32), 'hex'));

-- 2. The jobs trigger sends the header ----------------------------------------
-- Identical to the previous version apart from the x-cron-secret header and the
-- pinned search_path.

create or replace function public.invoke_geofence_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $function$
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.cron_config where key = 'edge_secret')
    ),
    body := payload
  );

  RETURN job_row;
END;
$function$;

-- 3. The pg_cron jobs send the header -----------------------------------------
-- Each command is rewritten in place so the schedule, the Ontario-time guard and
-- everything else stay exactly as they were. The secret is looked up when the job
-- runs; the command text holds only the lookup, never the value.

-- Commands that call net.http_post directly (single quotes).
select cron.alter_job(
  jobid,
  command := replace(
    command,
    $$'application/json'$$,
    $$'application/json', 'x-cron-secret', (select value from public.cron_config where key = 'edge_secret')$$
  )
)
from cron.job
where jobname in ('vehicle-telemetry-poll', 'cut-times-weekly')
  and command not like '%x-cron-secret%';

-- Commands wrapped in DO ... EXECUTE '...' (quotes doubled inside the string).
select cron.alter_job(
  jobid,
  command := replace(
    command,
    $$''application/json''$$,
    $$''application/json'', ''x-cron-secret'', (select value from public.cron_config where key = ''edge_secret'')$$
  )
)
from cron.job
where jobname in ('geofence-events-poll', 'geofence-events-sat',
                  'geofence-morning-sync', 'geofence-nightly-cleanup')
  and command not like '%x-cron-secret%';

-- 4. geofence-events: give pg_net time to hear the answer ---------------------
-- A poll takes about 5 s on average and up to 12 s (one Geotab sign-in plus a full
-- day of GPS points; measured over the 24 h before this change: 52 polls, all 200)
-- and pg_net hangs up at its 5 s default, so about half the polls were recorded as
-- timeouts even though the function carried on and finished. 30 s only changes how
-- long pg_net waits for the reply.
select cron.alter_job(
  jobid,
  command := replace(
    command,
    $$body := ''{}''::jsonb$$,
    $$body := ''{}''::jsonb,
    timeout_milliseconds := 30000$$
  )
)
from cron.job
where jobname in ('geofence-events-poll', 'geofence-events-sat')
  and command not like '%timeout_milliseconds%';
