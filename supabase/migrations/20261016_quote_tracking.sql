-- Quote tracking (Kelly's suggestion, 2026-10-16): did a Junk Quote turn into a job,
-- and has anyone followed up on the ones that didn't? Written only by
-- app-quote-followup.js through patchJob — deliberately NOT in jobToDb, so saving a
-- quote through the booking form can never wipe these.
alter table public.jobs
  add column if not exists quote_outcome text check (quote_outcome in ('booked','lost')),
  add column if not exists quote_job_id text,
  add column if not exists quote_note text,
  add column if not exists quote_followed_up_at timestamptz;

comment on column public.jobs.quote_outcome is 'Junk Quote only: booked | lost | null (still open)';
comment on column public.jobs.quote_job_id is 'Junk Quote only: the job it turned into';
comment on column public.jobs.quote_note is 'Junk Quote only: last follow-up note';
comment on column public.jobs.quote_followed_up_at is 'Junk Quote only: when someone last followed up';
