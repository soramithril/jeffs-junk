-- The driving report is its own announcement, built at 12:30 and played on the office TV
-- once Kelly has left the app idle for 15 minutes after 1 PM (Jake 2026-11-13).

-- 1. An arrival can now be several kinds per person per day: Kelly's sign-in AND her going idle.
alter table public.tv_arrivals drop constraint if exists tv_arrivals_who_day_key;
alter table public.tv_arrivals add constraint tv_arrivals_who_source_day_key unique (who, source, day);

create or replace function public.tv_arrival_on_sign_in() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  who text;
begin
  begin
    if extract(hour from now() at time zone 'America/Toronto') < 7 then
      return new;
    end if;
    select p.full_name into who from public.user_profiles p where p.id = new.user_id;
    if who = 'Kelly' then
      insert into public.tv_arrivals (who, source) values (who, 'sign-in')
        on conflict (who, source, day) do nothing;
    end if;
  exception when others then
    raise warning 'tv_arrival_on_sign_in: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 2. The dashboard calls this when nobody has touched it for 15 minutes. Only Kelly counts,
--    and only from 1 PM Toronto time; anyone else's call does nothing.
create or replace function public.tv_kelly_idle() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  who text;
begin
  if extract(hour from now() at time zone 'America/Toronto') < 13 then
    return;
  end if;
  select p.full_name into who from public.user_profiles p where p.id = auth.uid();
  if who = 'Kelly' then
    insert into public.tv_arrivals (who, source) values (who, 'idle')
      on conflict (who, source, day) do nothing;
  end if;
end;
$$;
revoke all on function public.tv_kelly_idle() from public, anon;
grant execute on function public.tv_kelly_idle() to authenticated;

-- 3. One dispatch function for both announcements; the morning job keeps calling it with no argument.
drop function if exists public.trigger_daily_briefing();
create function public.trigger_daily_briefing(kind text default 'briefing') returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok text;
begin
  if kind not in ('briefing', 'driving') then
    raise exception 'trigger_daily_briefing: unknown kind %', kind;
  end if;
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
    body := jsonb_build_object('event_type', kind)
  );
end;
$$;
revoke all on function public.trigger_daily_briefing(text) from public, anon, authenticated;

-- 4. The driving report is built at 12:30 PM Toronto time, Monday to Friday.
select cron.schedule('driving-report-trigger', '30 16,17 * * 1-5',
  $cmd$DO $tz$ BEGIN IF extract(hour from now() at time zone 'America/Toronto') = 12 THEN EXECUTE 'select public.trigger_daily_briefing(''driving'')'; END IF; END $tz$$cmd$);
