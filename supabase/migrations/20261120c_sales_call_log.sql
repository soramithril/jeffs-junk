-- One log for every sales contact (2026-11-20).
--
-- prospect_visits was the log for businesses on the Prospects list. Calls made
-- to a permit lead had nowhere to be written, so "calls this week" could not
-- count them. A row now belongs to EITHER a prospect or a permit lead, never
-- both and never neither, and the Prospects scoreboard reads this one table.
--
-- Safe for the version already live: existing rows all carry a prospect_id,
-- and the live page only ever inserts rows that do.

alter table public.prospect_visits
  alter column prospect_id drop not null,
  add column permit_lead_id bigint references public.permit_leads(id) on delete cascade,
  add constraint prospect_visits_one_subject
    check ((prospect_id is null) <> (permit_lead_id is null));

create index prospect_visits_visited_on_idx on public.prospect_visits (visited_on desc);
create index prospect_visits_permit_lead_idx on public.prospect_visits (permit_lead_id)
  where permit_lead_id is not null;
