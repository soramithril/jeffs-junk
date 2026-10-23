-- Scheduled jobs follow Ontario time, summer and winter.
--
-- pg_cron runs on UTC (cron.timezone = GMT, a server setting Supabase does not let us change),
-- so on 1 November 2026, when the clocks go back, every job would run an hour EARLIER in local
-- time: the 6:45 bin-count phone alert at 5:45, the 8:45 TV briefing at 7:45, the truck-zone
-- checks 6 am-6 pm instead of 7 am-7 pm. And the same again, the other way, every March.
--
-- Fix: each time-of-day job is scheduled at BOTH possible UTC hours and its command first checks
-- the Ontario clock, running only when the local hour is right. Nothing has to be touched at
-- either clock change ever again. The commands themselves are not retyped here: each one is
-- wrapped in place (read from cron.job), so this file holds no keys.
--
-- Also fixes driver scores never having a Friday or Saturday: vehicle-telemetry-poll ran
-- Monday-Friday at 05:00 UTC, and each run records the day before, so Sun-Thu got recorded and
-- Fri/Sat never did. It now runs every day.
--
-- Not touched: monthly-report-email (an hour either way is harmless), auto-clockout-crew,
-- cut-times-weekly, cleanup-http-response-logs.

do $m$
declare
  j record;
begin
  for j in
    select * from (values
      -- jobname,                    new UTC schedule,          Ontario-time condition
      ('daily-bins-push',          '45 10,11 * * 1-6',      'extract(hour from now() at time zone ''America/Toronto'') = 6'),
      ('geofence-morning-sync',    '0 10,11 * * 1-6',       'extract(hour from now() at time zone ''America/Toronto'') = 6'),
      ('daily-briefing-trigger',   '45 12,13 * * 1-6',      'extract(hour from now() at time zone ''America/Toronto'') = 8'),
      ('geofence-nightly-cleanup', '0 3,4 * * 0,2-6',       'extract(hour from now() at time zone ''America/Toronto'') = 23'),
      ('geofence-events-poll',     '*/15 0,11-23 * * *',    'extract(isodow from now() at time zone ''America/Toronto'') between 1 and 5 and extract(hour from now() at time zone ''America/Toronto'') between 7 and 19'),
      ('geofence-events-sat',      '*/15 11-20 * * 6',      'extract(isodow from now() at time zone ''America/Toronto'') = 6 and extract(hour from now() at time zone ''America/Toronto'') between 7 and 15')
    ) as t(jobname, sched, guard)
  loop
    perform cron.alter_job(
      job_id   := (select jobid from cron.job where jobname = j.jobname),
      schedule := j.sched,
      command  := (select case when command like 'DO $tz$%' then command
                    else 'DO $tz$ BEGIN IF ' || j.guard || ' THEN EXECUTE ' || quote_literal(command) || '; END IF; END $tz$'
                    end
                   from cron.job where jobname = j.jobname)
    );
  end loop;

  perform cron.alter_job(
    job_id   := (select jobid from cron.job where jobname = 'vehicle-telemetry-poll'),
    schedule := '0 5 * * *'
  );
end
$m$;
