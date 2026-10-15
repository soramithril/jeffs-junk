-- Winter route map (Jake, 2026-10-15). Each winter site gets its spot on the map,
-- the route group it belongs to and its stop number inside that group. Codes like
-- SV-04 are group + stop; the app renumbers a group in driving order whenever a
-- site is added to it, moved out of it or deleted.
--
-- The groups live in their own small table so a rename or a new group is a data
-- change, not a deploy. Grouping came from real drive times between the sites in
-- the old Canva winter book (see the Winter Route Plan artifact).

create table public.jwg_winter_groups (
  code       text primary key,
  name       text not null,
  color      text not null,
  sort_order int  not null
);

insert into public.jwg_winter_groups (code, name, color, sort_order) values
  ('E',  'Downtown & East End',      '#00732e', 1),
  ('N',  'North End',                '#2563eb', 2),
  ('W',  'West End',                 '#9333ea', 3),
  ('A',  'Essa & Ardagh',            '#db2777', 4),
  ('SB', 'South End · Bayview side', '#ea580c', 5),
  ('SV', 'South End · Veterans side','#0891b2', 6);

alter table public.jwg_winter_groups enable row level security;
create policy jwg_winter_groups_read on public.jwg_winter_groups
  for select to authenticated using (true);
create policy jwg_winter_groups_admin_write on public.jwg_winter_groups
  for all to authenticated using (is_admin()) with check (is_admin());

alter table public.jwg_service_locations
  add column lat          double precision,
  add column lng          double precision,
  add column winter_group text references public.jwg_winter_groups(code),
  add column winter_stop  int,
  -- Snow drop zones drawn on the site photo: [[x, y, w, h], ...] as fractions of
  -- the photo, so they line up at any size. Filled from the book now, edited in
  -- the site editor later.
  add column site_marks   jsonb;
