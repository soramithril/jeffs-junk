-- Winter site plans (Jake, 2026-10-15): each winter site gets an aerial photo
-- (a Google Earth screenshot the office uploads) with the snow drop zones drawn
-- on it (site_marks, added in 20261015_winter_route_groups.sql).
--
-- Photos live in a PRIVATE bucket: anyone signed in can view them (through a
-- short-lived signed link), only admins can add, replace or remove them — the
-- same split as jwg_service_locations itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('winter-sites', 'winter-sites', false, 5242880, array['image/jpeg']);

create policy winter_sites_read on storage.objects
  for select to authenticated using (bucket_id = 'winter-sites');
create policy winter_sites_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'winter-sites' and is_admin());
create policy winter_sites_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'winter-sites' and is_admin());
create policy winter_sites_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'winter-sites' and is_admin());

-- Path of the site's current photo inside the bucket, e.g. sites/<id>/<time>.jpg.
-- A new upload gets a new path, so a replaced photo never shows from cache.
alter table public.jwg_service_locations add column photo_path text;
