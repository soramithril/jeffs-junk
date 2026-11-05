-- Where each bin sitting at a customer is, for the office TV map (Jake, 2026-11-05).
-- One row per dropped bin job: its address looked up once through Geotab by the
-- bin-spots edge function, so the wall never sends addresses to a geocoder itself.
-- lat/lng stay null when Geotab could not place the address (not retried until the
-- address changes). Rows for bins that came home are removed by the same function.
create table public.bin_spots (
  job_id      text primary key,
  address     text not null,
  lat         double precision,
  lng         double precision,
  geocoded_at timestamptz not null default now()
);
alter table public.bin_spots enable row level security;
-- Read like the other staff tables (the office TV's display account included).
-- No insert/update/delete policies: only the edge function (elevated key) writes.
create policy staff_read on public.bin_spots for select to authenticated
  using ((select staff_tier()) = any (array['developer','owner','lead','office','display']));
