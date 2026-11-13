-- The office TV briefing plays when someone arrives, not at a fixed 9 AM (Jake 2026-11-13):
-- Barb walking in before 8 (seen by the office camera, once that is wired up), or after 8
-- Kelly signing in to the app. This table is the one place arrivals land; office-tv.html
-- reads today's rows and plays on the first one that counts.
--
-- Kelly's sign-in is recorded by the database itself: a trigger on auth.sessions, so no
-- page of the app has to change and every way she signs in counts. Only from 7 AM
-- Toronto time, so a sign-in from home at dawn does not set the office TV off. The TV
-- itself waits until 8 for a Kelly arrival.
--
-- The trigger must never stop anyone signing in, so any failure inside it is turned
-- into a warning in the Postgres log instead of an error.

create table if not exists public.tv_arrivals (
  id     bigint generated always as identity primary key,
  who    text not null,                       -- user_profiles.full_name, e.g. 'Kelly'
  source text not null,                       -- 'sign-in' now; 'camera' once Barb's camera feeds it
  at     timestamptz not null default now(),
  day    date not null default ((now() at time zone 'America/Toronto')::date),
  unique (who, day)
);
alter table public.tv_arrivals enable row level security;
drop policy if exists staff_read on public.tv_arrivals;
create policy staff_read on public.tv_arrivals for select to authenticated
  using ((select public.staff_tier()) = any (array['developer','owner','lead','office','display']));

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
        on conflict (who, day) do nothing;
    end if;
  exception when others then
    raise warning 'tv_arrival_on_sign_in: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.tv_arrival_on_sign_in() from public, anon, authenticated;

drop trigger if exists tv_arrival_on_sign_in on auth.sessions;
create trigger tv_arrival_on_sign_in after insert on auth.sessions
  for each row execute function public.tv_arrival_on_sign_in();

-- The briefing is built at 6:45 AM instead of 8:45, so it is ready before anyone walks in.
-- Same two UTC hours trick as 20261023_cron_follows_ontario_time.sql, one hour earlier.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'daily-briefing-trigger'),
  schedule := '45 10,11 * * 1-5',
  command := $cmd$DO $tz$ BEGIN IF extract(hour from now() at time zone 'America/Toronto') = 6 THEN EXECUTE 'select public.trigger_daily_briefing()'; END IF; END $tz$$cmd$
);
