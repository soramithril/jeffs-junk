-- 2026-11-03: the GPS zone-visit polls stop sending the retired legacy anon key.
--
-- Since about 7:20 pm ET on 2026-11-02 Supabase refuses any request that carries the
-- legacy anon JWT, so every geofence-events poll came back 401 and the office TV's
-- "Bin work today" screen crossed nothing off. geofence-events was redeployed with
-- verify_jwt = false (v25, same code - it never trusted the caller anyway, it is
-- visual-only and reads with SB_SECRET_KEY), and these two schedules now send no
-- Authorization header at all, the same as geofence-morning-sync already does.
--
-- Applied live with cron.alter_job on 2026-11-03; this file records it.

select cron.alter_job(jobid, command := regexp_replace(command,
  $re$,\s*''Authorization'',\s*''Bearer [A-Za-z0-9_.\-]+''$re$, '', 'g'))
from cron.job
where jobname in ('geofence-events-poll', 'geofence-events-sat');

-- Same day, same cause: the morning bins push, the new-junk-quote push and the
-- Sunday cut-times sync also sent the retired key. send-push (v7, now reads with
-- SB_SECRET_KEY; 'notify' stays locked by push_config.trigger_secret) and
-- cut-times-sync (v11, same code) were redeployed with verify_jwt = false, and
-- their callers stop sending the key.

select cron.alter_job(jobid, command := regexp_replace(command,
  $re$,\s*''Authorization'',\s*''Bearer [A-Za-z0-9_.\-]+''$re$, '', 'g'))
from cron.job where jobname = 'daily-bins-push';

select cron.alter_job(jobid, command := regexp_replace(command,
  $re$,\s*'Authorization',\s*'Bearer [A-Za-z0-9_.\-]+'$re$, '', 'g'))
from cron.job where jobname = 'cut-times-weekly';

do $do$ declare d text; begin
  d := pg_get_functiondef('public.notify_new_junk_quote'::regproc);
  d := regexp_replace(d, $re$,\s*'Authorization',\s*'Bearer [A-Za-z0-9_.\-]+'$re$, '', 'g');
  execute d;
end $do$;
