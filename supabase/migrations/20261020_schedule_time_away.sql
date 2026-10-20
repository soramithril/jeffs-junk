-- Crew Schedule rebuild (2026-10-20): time away becomes ONE list.
--
-- Before: time away was saved two ways. Day off / Sick / Non working were a day STATUS with
-- no shifts; Vacation Day / Office Closed / Out of Office / Appointment were job types with
-- hours (mostly the 7am-7pm default), so they counted as worked hours and the office TV
-- counted those people as working.
--
-- After: every kind of time away is an entry in the day's shifts whose type is flagged
-- away:true in jwg_app_settings.tasks. It counts no hours (Jake: vacation and office closed
-- are not paid). An away entry with no start/end is all day; real part-days (most
-- Appointments and Personal) keep their hours. A day's status is "work" when it holds a job,
-- "away" when it holds only time away, "off" when empty. Jake's answers, same day:
--   Out of Office -> "Personal" (somewhere personal that day)
--   Non working   -> "No work"  (not enough work for them)
-- The app (app-jwg-scheduler.js normDay) also reads any day still saved the old way, so a
-- tab left open on the old page cannot break anything while this runs.
--
-- Dry run on 2026-10-20: 497 days change (249 vacation/closed/personal/appointment days stop
-- counting as work; 248 old status days move into the list); 1704 job days untouched; one
-- usual week (Micaela's Friday day off) converts.

-- 1. The type list: away flags, the new built-in "No work", plain names, and readable colours
--    for the three jobs whose colour could not carry a white icon (pure yellow, pure cyan, pale lilac).
with cur as (select value from jwg_app_settings where key = 'tasks'),
m(id, label, dot, away) as (values
  ('off',            'Day off',       '#64748b', true),
  ('sick',           'Sick',          '#64748b', true),
  ('c1773413122398', 'Vacation',      '#64748b', true),
  ('c1773966681375', 'Office closed', '#64748b', true),
  ('c1774217214691', 'Personal',      '#64748b', true),
  ('c1774552266004', 'Appointment',   '#64748b', true),
  ('junk',           null,            '#ca8a04', null),
  ('c1773110813752', null,            '#0d9488', null),
  ('c1773179207331', null,            '#0ea5e9', null)
),
rgb as (
  select id, label, dot, away,
    ('x' || substr(dot, 2, 2))::bit(8)::int as r,
    ('x' || substr(dot, 4, 2))::bit(8)::int as g,
    ('x' || substr(dot, 6, 2))::bit(8)::int as b
  from m
),
patched as (
  select ord, t || coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
        'label', x.label, 'dot', x.dot, 'away', x.away,
        'bg',   format('rgba(%s,%s,%s,0.12)', x.r, x.g, x.b),
        'text', format('rgb(%s,%s,%s)', round(x.r * .55), round(x.g * .55), round(x.b * .55))))
      from rgb x where x.id = t->>'id'), '{}'::jsonb) as t
  from cur, jsonb_array_elements(cur.value) with ordinality as e(t, ord)
),
withnowork as (
  select ord::numeric as ord, t from patched
  union all
  select (select ord from patched where t->>'id' = 'sick') + 0.5,
         '{"id":"nowork","label":"No work","builtIn":true,"away":true,"dot":"#64748b","bg":"rgba(100,116,139,0.12)","text":"rgb(55,64,76)"}'::jsonb
  where not exists (select 1 from patched where t->>'id' = 'nowork')
)
update jwg_app_settings
set value = (select jsonb_agg(t order by ord) from withnowork), updated_at = now()
where key = 'tasks';

-- 2. Every saved day, and every "same every week" pattern.
create or replace function pg_temp.conv_day(v jsonb) returns jsonb language plpgsql as $$
declare
  away text[] := array['off','sick','nowork','c1773413122398','c1773966681375','c1774217214691','c1774552266004'];
  shifts jsonb; outa jsonb := '[]'::jsonb; sh jsonb; ids jsonb; st text; en text;
  all_away boolean; any_job boolean := false; legacy text;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return v; end if;
  shifts := case when jsonb_typeof(v->'shifts')='array' then v->'shifts' else '[]'::jsonb end;
  legacy := case v->>'status' when 'dayoff' then 'off' when 'sick' then 'sick' when 'nonworking' then 'nowork' end;
  if legacy is not null and jsonb_array_length(shifts)=0 then
    shifts := jsonb_build_array(jsonb_build_object('tasks', jsonb_build_array(legacy)));
  end if;
  for sh in select * from jsonb_array_elements(shifts) loop
    ids := coalesce(
      case when jsonb_typeof(sh->'tasks')='array' and jsonb_array_length(sh->'tasks')>0 then sh->'tasks' end,
      case when sh ? 'task' then jsonb_build_array(sh->>'task') end,
      '[]'::jsonb);
    all_away := jsonb_array_length(ids)>0 and not exists(select 1 from jsonb_array_elements_text(ids) t where not (t = any(away)));
    if all_away then
      st := sh->>'start'; en := sh->>'end';
      -- the old whole-day default (7am or 8:30 to 7 or 8pm) becomes all day; real part-days keep their hours
      if st is not null and en is not null and en in ('19:00','20:00')
         and (split_part(st,':',1)::int*60 + coalesce(nullif(split_part(st,':',2),''),'0')::int) <= 510 then
        sh := sh - 'start' - 'end';
      end if;
    else
      any_job := true;
    end if;
    outa := outa || jsonb_build_array(sh);
  end loop;
  return v || jsonb_build_object('shifts', outa, 'status',
    case when jsonb_array_length(outa)=0 then 'off' when any_job then 'work' else 'away' end);
end $$;

update jwg_schedules s
set schedule_data = (select jsonb_object_agg(k, pg_temp.conv_day(v)) from jsonb_each(s.schedule_data) e(k, v))
where jsonb_typeof(s.schedule_data) = 'object'
  and s.schedule_data is distinct from (select jsonb_object_agg(k, pg_temp.conv_day(v)) from jsonb_each(s.schedule_data) e(k, v));

update jwg_employees e
set usual_week = (select jsonb_object_agg(k, pg_temp.conv_day(v)) from jsonb_each(e.usual_week) x(k, v))
where jsonb_typeof(e.usual_week) = 'object'
  and e.usual_week is distinct from (select jsonb_object_agg(k, pg_temp.conv_day(v)) from jsonb_each(e.usual_week) x(k, v));
