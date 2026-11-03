-- Clothing designs with a photo (2026-11-03, Jake picked mockup B, the "design shelf":
-- "we might have different design for different hoodies").
--
-- A design is one garment the shop hands out: its photo, a name ("Hoodie, grey, back logo"),
-- what kind of item it is, and which company it is for. Sam photographs it once; every
-- handout after that points at it. Each clothing record now belongs to a design.
--
-- jwg_employee_clothing keeps its item_type and company columns, written from the design on
-- every handout, so a record still reads on its own. The price columns are no longer shown
-- or written (all 8 records were $0; the money side lives in QuickBooks).
--
-- Apply right before the merge that ships the new Clothing page: design_id is NOT NULL, so
-- the old page (which saves without one) cannot add records once this has run.

create table public.jwg_clothing_designs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (name <> ''),
  item_type  text not null,
  company    text not null check (company in ('Jeffs Junk', 'Jeff White Group')),
  photo_path text,            -- in the private 'clothing-designs' bucket
  created_at timestamptz not null default now()
);

alter table public.jwg_clothing_designs enable row level security;

-- Same rules as the clothing records themselves.
create policy jwg_clothing_designs_read   on public.jwg_clothing_designs for select to authenticated using (true);
create policy jwg_clothing_designs_insert on public.jwg_clothing_designs for insert to authenticated with check (true);
create policy jwg_clothing_designs_update on public.jwg_clothing_designs for update to authenticated using (true);
create policy jwg_clothing_designs_delete on public.jwg_clothing_designs for delete to authenticated using (public.can_delete_rows());
create policy staff_read on public.jwg_clothing_designs as restrictive for select to authenticated using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','display']));
create policy staff_insert on public.jwg_clothing_designs as restrictive for insert to authenticated with check (
  (select public.staff_tier()) = any (array['developer','owner','lead','office']));
create policy staff_update on public.jwg_clothing_designs as restrictive for update to authenticated using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office'])) with check (
  (select public.staff_tier()) = any (array['developer','owner','lead','office']));
create policy staff_delete on public.jwg_clothing_designs as restrictive for delete to authenticated using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office']));

-- Photos. Private bucket; anyone on staff reads, office and up add or replace.
insert into storage.buckets (id, name, public) values ('clothing-designs', 'clothing-designs', false);
create policy clothing_designs_read on storage.objects for select to authenticated using (bucket_id = 'clothing-designs');
create policy clothing_designs_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'clothing-designs' and (select public.staff_tier()) = any (array['developer','owner','lead','office']));
create policy clothing_designs_update on storage.objects for update to authenticated using (
  bucket_id = 'clothing-designs' and (select public.staff_tier()) = any (array['developer','owner','lead','office']));
create policy clothing_designs_delete on storage.objects for delete to authenticated using (
  bucket_id = 'clothing-designs' and (select public.staff_tier()) = any (array['developer','owner','lead','office']));

-- The 8 records from 2026-06-18 sort into 4 designs. The colour of the Jeffs Junk tees was
-- typed into Notes ("GREY T-Shirt" / "BLACK T-Shirt"); the Jeff White Group ones have none.
alter table public.jwg_employee_clothing add column design_id uuid references public.jwg_clothing_designs(id);

with d as (
  insert into public.jwg_clothing_designs (name, item_type, company) values
    ('T-Shirt, grey',  'T-Shirt',     'Jeffs Junk'),
    ('T-Shirt, black', 'T-Shirt',     'Jeffs Junk'),
    ('T-Shirt',        'T-Shirt',     'Jeff White Group'),
    ('Long Sleeve',    'Long Sleeve', 'Jeff White Group')
  returning id, name, company
)
update public.jwg_employee_clothing c set design_id = d.id
from d
where c.company = d.company
  and c.item_type = case when d.name like 'T-Shirt%' then 'T-Shirt' else 'Long Sleeve' end
  and (d.company = 'Jeff White Group'
       or (d.name = 'T-Shirt, grey'  and c.notes ilike 'grey%')
       or (d.name = 'T-Shirt, black' and c.notes ilike 'black%'));

-- Fails here (and rolls back everything above) if any record was left without a design.
alter table public.jwg_employee_clothing alter column design_id set not null;
