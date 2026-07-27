-- Cut Times: where Darrin's truck stops and for how long.
--
-- Source is a MyGeotab stop-history pull (method in docs/cut-times/SPEC.md, local only).
-- The raw JSON is deliberately NOT in the repo: it is customer addresses plus one
-- employee's movement history, and this repo is public. Same reasoning as audit/.
--
-- Read is open to signed-in staff; the snapshot is only replaced by a fresh analysis
-- pull, so writing is admin-only.

create table if not exists public.jwg_cut_locations (
  cl          integer primary key,          -- cluster id from the analysis
  address     text    not null,
  lat         double precision not null,
  lon         double precision not null,
  visits      integer not null,
  avg_min     numeric not null,
  median_min  numeric not null,
  min_min     numeric not null,
  max_min     numeric not null,
  total_hrs   numeric not null,
  flagged     integer not null default 0
);

-- No FK to jwg_cut_locations: home-base and quick stops carry cluster ids that are
-- not cut locations. Address is kept on the row exactly as the analysis emitted it.
create table if not exists public.jwg_cut_visits (
  id          bigserial primary key,
  cl          integer not null,
  address     text    not null,
  type        text    not null,             -- job_visit | quick_stop | home_base | long_park
  visit_date  date    not null,
  day         text    not null,
  arrive      text    not null,             -- local (Eastern) wall clock, HH:MM
  depart      text    not null,
  dur_min     numeric not null,
  flag        boolean not null default false
);

create index if not exists jwg_cut_visits_date_idx on public.jwg_cut_visits (visit_date);
create index if not exists jwg_cut_visits_type_idx on public.jwg_cut_visits (type);

alter table public.jwg_cut_locations enable row level security;
alter table public.jwg_cut_visits    enable row level security;

create policy "jwg_cut_locations_read"   on public.jwg_cut_locations for select to authenticated using (true);
create policy "jwg_cut_locations_insert" on public.jwg_cut_locations for insert to authenticated with check (public.is_admin());
create policy "jwg_cut_locations_update" on public.jwg_cut_locations for update to authenticated using (public.is_admin());
create policy "jwg_cut_locations_delete" on public.jwg_cut_locations for delete to authenticated using (public.is_admin());

create policy "jwg_cut_visits_read"   on public.jwg_cut_visits for select to authenticated using (true);
create policy "jwg_cut_visits_insert" on public.jwg_cut_visits for insert to authenticated with check (public.is_admin());
create policy "jwg_cut_visits_update" on public.jwg_cut_visits for update to authenticated using (public.is_admin());
create policy "jwg_cut_visits_delete" on public.jwg_cut_visits for delete to authenticated using (public.is_admin());
