-- Review follow-up: staff flag a happy customer on the work order, and the
-- dashboard surfaces them 2 days after the job so someone asks for the review.
-- review_ask     — the decision ("this one would leave a good review")
-- review_asked_at — when the review-request email actually went out (stops re-asking)
alter table public.jobs
  add column if not exists review_ask boolean not null default false,
  add column if not exists review_asked_at timestamptz;

-- Only flagged, not-yet-asked jobs are ever queried, so the index stays tiny.
create index if not exists jobs_review_ask_idx
  on public.jobs (review_ask)
  where review_ask = true and review_asked_at is null;
