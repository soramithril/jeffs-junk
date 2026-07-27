-- Applied to the live project 2026-07-27. Per Jake.
--
-- Seeds the Summer page's lawn & grounds list from the Geotab cut history, so the
-- Weekly Schedule grid has the real route in it instead of one lone Office row.
--
-- Names: the Geotab pull has addresses but no customer names, so the street line
-- is used as the client name for now (Jake's call) — type real names over them as
-- they come in.
-- Service day: the weekday the truck actually visits most often. 38 of the 50 land
-- on one weekday in 80%+ of visits, 10 more in 60%+, 2 are genuinely scattered and
-- just take their most common day.
-- All 50 were imported, including 353 Duckworth St Unit 16 (flagged in
-- docs/cut-times/SPEC.md as probably a shop or supplier stop) — Jake's call, delete
-- from the Summer page if it doesn't belong.

with dominant_day as (
  select cl, day,
         row_number() over (partition by cl order by count(*) desc, min(visit_date)) as rk
  from jwg_cut_visits
  where type = 'job_visit'
  group by cl, day
)
insert into jwg_service_locations
  (client_name, address, city, service_day, has_summer_service, has_winter_service, is_archived)
select
  trim(split_part(l.address, ',', 1)),
  trim(split_part(l.address, ',', 1)),
  trim(split_part(l.address, ',', 2)),
  case d.day
    when 'Mon' then 'Monday'  when 'Tue' then 'Tuesday' when 'Wed' then 'Wednesday'
    when 'Thu' then 'Thursday' when 'Fri' then 'Friday' when 'Sat' then 'Saturday'
  end,
  true, false, false
from jwg_cut_locations l
join dominant_day d on d.cl = l.cl and d.rk = 1;
