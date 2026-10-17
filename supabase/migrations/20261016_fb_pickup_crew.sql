-- Crew iPad for Furniture Bank pickups (2026-10-16, Jake: "lets make the ipad version for
-- the furniture bank"). A shared truck iPad signs in with a login whose role is 'crew' and
-- opens fb-pickup.html. Built on 20261016_staff_only_access.
--
-- What a crew login can do, and nothing else:
--   * read TODAY's Furniture Pickup jobs (not cancelled or postponed) — no other job, no
--     client list, no other table
--   * read the Furniture Bank price list and the price sheet (for the zone minimum)
--   * write the at-the-door record for those jobs into fb_door_checks
-- It can never change a job: the office's booked list stays exactly as Kelly entered it,
-- and the crew's list sits beside it so the office can compare the two (Jake: "theres 2,
-- one that they fill out and the one from the office").

alter policy staff_read on public.jobs using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','display'])
  or ((select public.staff_tier()) = 'crew'
      and service = 'Furniture Pickup'
      and status = ''
      and coalesce(fb_date, date) = (now() at time zone 'America/Toronto')::date)
);

alter policy staff_read on public.furniture_prices using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','display','crew'])
);

alter policy staff_read on public.our_prices using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','display','crew'])
);

-- One record per pickup: the crew's list, the price the customer saw, and their signature.
-- The money columns are what was SHOWN at the door, kept so the office sees exactly what was
-- signed for; QuickBooks is still where the money lives.
create table public.fb_door_checks (
  job_id      text primary key references public.jobs(job_id) on delete cascade,
  lines       jsonb not null,    -- [{name, booked, qty, loaded, added, fee, val}]
  items_fee   numeric not null,  -- sum of fees, before the zone minimum
  pay         numeric not null,  -- what the customer pays before HST (zone minimum applied)
  pay_note    text not null,     -- why pay is what it is (furnitureCustomerPays note)
  hst         numeric not null,
  receipt     numeric not null,  -- tax receipt value of the crew's list
  signed_name text not null,
  signature   text not null,     -- PNG data URL of the customer's signature
  finished_at timestamptz not null default now(),
  finished_by uuid not null default auth.uid()
);

alter table public.fb_door_checks enable row level security;

-- The jobs check inside each rule runs under the caller's own jobs rules, so a crew login
-- only reaches the records of jobs it can see (today's pickups).
create policy fb_door_checks_read on public.fb_door_checks for select to authenticated using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','crew'])
  and exists (select 1 from public.jobs j where j.job_id = fb_door_checks.job_id)
);
create policy fb_door_checks_insert on public.fb_door_checks for insert to authenticated with check (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','crew'])
  and exists (select 1 from public.jobs j where j.job_id = fb_door_checks.job_id)
);
create policy fb_door_checks_update on public.fb_door_checks for update to authenticated using (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','crew'])
  and exists (select 1 from public.jobs j where j.job_id = fb_door_checks.job_id)
) with check (
  (select public.staff_tier()) = any (array['developer','owner','lead','office','crew'])
  and exists (select 1 from public.jobs j where j.job_id = fb_door_checks.job_id)
);
create policy fb_door_checks_delete on public.fb_door_checks for delete to authenticated using (
  public.can_delete_rows()
);

revoke all on public.fb_door_checks from anon;
