-- Furniture Bank Toronto collections (Kelly's suggestion, 2026-10-09).
-- Our Furniture Pickup jobs go to the storage unit we rent; Furniture Bank Toronto's
-- truck collects from there on dates they book with us (about every two weeks). The
-- office enters those dates; the dashboard shows the line on the day and the next
-- date otherwise (app-fbcollect.js). Schedule notes, not business records, so any
-- signed-in staff member may add, move or remove one.

create table public.fb_collections (
  id bigint generated always as identity primary key,
  collect_date date not null,
  -- Unused: the note box was dropped before launch (Jake, 2026-10-09). Dropping the
  -- column timed out through the Supabase tool; it fills itself with '' on every insert.
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

alter table public.fb_collections enable row level security;

create policy fb_collections_read   on public.fb_collections for select to authenticated using (true);
create policy fb_collections_insert on public.fb_collections for insert to authenticated with check (true);
create policy fb_collections_update on public.fb_collections for update to authenticated using (true);
create policy fb_collections_delete on public.fb_collections for delete to authenticated using (true);
