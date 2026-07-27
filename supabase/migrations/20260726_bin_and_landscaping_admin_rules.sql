-- Applied to the live project 2026-07-26 (migration: bin_and_landscaping_admin_rules). Per Jake.
--
-- BINS: office staff call bins in and out all day, and may record condition (colour, damage,
-- decals, repaint, notes). They may not create or delete a bin, and may not rename one — the code
-- on the side of the bin (14R-29, 14LW-25) is its identity, and size/type are what the code
-- encodes, so those are locked along with the name.
--
-- Column-level GRANTs can't express this, because admins and staff are both the 'authenticated'
-- role. A BEFORE UPDATE trigger can, because it sees the old row and the new row together.

create or replace function public.bin_items_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.bid  is distinct from old.bid
  or new.num  is distinct from old.num
  or new.size is distinct from old.size
  or new.type is distinct from old.type then
    raise exception 'Only an admin can change a bin''s number, size or type';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bin_items_guard on bin_items;
create trigger trg_bin_items_guard
  before update on bin_items
  for each row execute function public.bin_items_guard();

drop policy "bin_items_insert" on bin_items;
create policy "bin_items_insert" on bin_items for insert to authenticated with check (public.is_admin());
drop policy "bin_items_delete" on bin_items;
create policy "bin_items_delete" on bin_items for delete to authenticated using (public.is_admin());

-- LANDSCAPING: the schedule is theirs to build — jwg_schedules, jwg_workshop_tasks and
-- crew_blocks stay fully editable, delete included. The people and the places they service are
-- reference data: read by everyone, changed only by an admin.
drop policy "jwg auth all" on jwg_employees;
create policy "jwg_employees_read" on jwg_employees for select to authenticated using (true);
create policy "jwg_employees_admin_write" on jwg_employees for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "jwg auth all" on jwg_service_locations;
create policy "jwg_service_locations_read" on jwg_service_locations for select to authenticated using (true);
create policy "jwg_service_locations_admin_write" on jwg_service_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "jwg auth all" on jwg_service_types;
create policy "jwg_service_types_read" on jwg_service_types for select to authenticated using (true);
create policy "jwg_service_types_admin_write" on jwg_service_types for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "jwg auth all" on jwg_location_services;
create policy "jwg_location_services_read" on jwg_location_services for select to authenticated using (true);
create policy "jwg_location_services_admin_write" on jwg_location_services for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Staff records on the junk side, same reasoning as jwg_employees.
drop policy "crew_members_insert" on crew_members;
create policy "crew_members_insert" on crew_members for insert to authenticated with check (public.is_admin());
drop policy "crew_members_update" on crew_members;
create policy "crew_members_update" on crew_members for update to authenticated using (public.is_admin());

-- NOTE: jwg_inventory_items / jwg_inventory_categories are deliberately left open to any signed-in
-- user. Darrin's back-shop kiosk updates stock and is a non-admin account; locking these breaks him.
