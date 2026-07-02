-- Admin-only daily staff ratings (1-5), one per employee per date.
-- NO ROW for a day means the default: 3 / "normal day" — quiet days cost
-- zero storage and zero writes. Rows exist only for deviations or notes.
--
-- NOT YET APPLIED: run this against the live project only after Jake
-- approves the Phase 7 rollout.

create table if not exists employee_ratings (
  employee_id uuid not null references jwg_employees(id) on delete cascade,
  rating_date date not null,
  rating smallint not null default 3 check (rating between 1 and 5),
  note text,
  rated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, rating_date)
);

alter table employee_ratings enable row level security;

-- Admins ONLY — both read and write. The user_profiles table lets each
-- signed-in user read exactly their own row, which is all this predicate
-- needs. No anon policy exists, so the public key gets nothing at all.
create policy "employee_ratings admin only" on employee_ratings
  for all to authenticated
  using (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = 'admin'));
