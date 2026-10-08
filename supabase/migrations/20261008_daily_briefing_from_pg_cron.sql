-- The office TV's spoken briefing is built by the daily-briefing GitHub workflow.
-- GitHub's own scheduler ran it hours late — set for 12:45 UTC (8:45 AM Eastern),
-- it started at 18:59 UTC on 2026-10-08 and in the afternoon most days before — so
-- the briefing would land mid-afternoon even once it worked again. pg_cron fires on
-- the minute, so it now sends the workflow a repository_dispatch ("briefing") at
-- 12:45 UTC Monday to Saturday instead, and the workflow no longer has a schedule.
--
-- Needs a GitHub fine-grained token for soramithril/jeffs-junk with
-- "Contents: Read and write" (the minimum GitHub accepts for repository_dispatch),
-- stored in the vault as github_briefing_token:
--   select vault.create_secret('<token>', 'github_briefing_token');
-- Without it the job raises an error every morning (visible in cron.job_run_details)
-- rather than skipping quietly.

create or replace function public.trigger_daily_briefing() returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_briefing_token';
  if tok is null then
    raise exception 'github_briefing_token is not in the vault, so the office TV briefing cannot be started';
  end if;
  return net.http_post(
    url := 'https://api.github.com/repos/soramithril/jeffs-junk/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'jeffs-junk-pg-cron',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('event_type', 'briefing')
  );
end;
$$;

-- Only pg_cron (running as postgres) may start it; never reachable from the site.
revoke all on function public.trigger_daily_briefing() from public, anon, authenticated;

select cron.schedule('daily-briefing-trigger', '45 12 * * 1-6', 'select public.trigger_daily_briefing()');
