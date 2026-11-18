-- Snow Times (Jake, 2026-11-18): a snow event is a day the tractors go out.
-- Written only by the snow-times-sync edge function (service key); staff read.
-- Derived from MyGeotab history and the winter book's site list, so a day can
-- always be rebuilt: nothing here is hand-entered.

create table public.jwg_snow_events (
  event_date   date primary key,           -- the snow day: 6 pm the evening before to 6 pm
  first_out    timestamptz not null,       -- first tractor away
  last_back    timestamptz not null,       -- last tractor stopped
  tractors_out integer not null,
  snow_cm      numeric,                    -- that day + the day before; null until reported
  snow_station text,
  computed_at  timestamptz not null default now()
);

create table public.jwg_snow_machines (
  event_date  date not null references public.jwg_snow_events(event_date) on delete cascade,
  device_id   text not null,               -- Geotab device id
  device_name text not null,               -- its Geotab name on the day
  is_tractor  boolean not null,
  first_out   timestamptz not null,
  last_back   timestamptz not null,
  km          numeric not null,
  primary key (event_date, device_id)
);

create table public.jwg_snow_visits (
  id          bigint generated always as identity primary key,
  event_date  date not null,
  device_id   text not null,
  location_id uuid not null references public.jwg_service_locations(id) on delete cascade,
  arrive      timestamptz not null,
  depart      timestamptz not null,
  dur_min     numeric not null,
  foreign key (event_date, device_id)
    references public.jwg_snow_machines(event_date, device_id) on delete cascade
);
create index jwg_snow_visits_event on public.jwg_snow_visits(event_date);
create index jwg_snow_visits_location on public.jwg_snow_visits(location_id);

alter table public.jwg_snow_events   enable row level security;
alter table public.jwg_snow_machines enable row level security;
alter table public.jwg_snow_visits   enable row level security;

-- Office staff read; nobody writes from the app.
create policy staff_read on public.jwg_snow_events for select to authenticated
  using ((select staff_tier()) = any (array['developer','owner','lead','office']));
create policy staff_read on public.jwg_snow_machines for select to authenticated
  using ((select staff_tier()) = any (array['developer','owner','lead','office']));
create policy staff_read on public.jwg_snow_visits for select to authenticated
  using ((select staff_tier()) = any (array['developer','owner','lead','office']));

revoke all on public.jwg_snow_events, public.jwg_snow_machines, public.jwg_snow_visits from anon;
revoke insert, update, delete, truncate on public.jwg_snow_events, public.jwg_snow_machines, public.jwg_snow_visits from authenticated;

-- What the Snow Times page reads: one row per event with its counts, and one
-- row per site per winter (a winter is July to June, named for its first year).
-- security_invoker, so the staff_read policies above still decide who sees rows.
create view public.jwg_snow_event_summary with (security_invoker = true) as
select e.*,
  (select count(*)::int from public.jwg_snow_machines m where m.event_date = e.event_date) as machines,
  (select count(distinct v.location_id)::int from public.jwg_snow_visits v where v.event_date = e.event_date) as sites_visited
from public.jwg_snow_events e;

create view public.jwg_snow_site_stats with (security_invoker = true) as
with per as (
  select event_date, location_id, sum(dur_min) as m
  from public.jwg_snow_visits group by event_date, location_id
)
select extract(year from event_date - interval '6 months')::int as season,
  location_id, count(*)::int as events_visited,
  round(avg(m), 1) as avg_min, round(min(m), 1) as min_min, round(max(m), 1) as max_min
from per group by 1, 2;

revoke all on public.jwg_snow_event_summary, public.jwg_snow_site_stats from anon;
revoke insert, update, delete, truncate on public.jwg_snow_event_summary, public.jwg_snow_site_stats from authenticated;
grant select on public.jwg_snow_event_summary, public.jwg_snow_site_stats to authenticated;

-- Every evening, November to April (23:30 UTC = 6:30 pm Eastern in winter, just
-- after the snow day closes at 6 pm).
select cron.schedule('snow-times-daily', '30 23 * 11,12,1,2,3,4 *', $$
  select net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/snow-times-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.cron_config where key = 'edge_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
