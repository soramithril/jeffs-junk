-- The office TV briefing is Monday to Friday only (Jake 2026-11-12); it used to run
-- Saturdays too. Same two UTC hours as 20261023_cron_follows_ontario_time.sql — the
-- command still checks the Ontario clock so it fires at 8:45 AM local all year.
-- Only the day-of-week field changes; the command is left as it is.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'daily-briefing-trigger'),
  schedule := '45 12,13 * * 1-5'
);
