-- Permit leads: the company named on a permit (2026-11-20, Jake: "always company
-- name so we know who to call or email").
--
-- Only Oro-Medonte's feed names anyone. The fetcher keeps the COMPANY on the
-- permit (builder first, then the applicant's firm) and its role - never a
-- person's name, email or phone. The office looks the company up and calls its
-- public number.
alter table public.permit_leads
  add column company text,
  add column company_role text;

drop function public.permit_leads_list();
create function public.permit_leads_list()
returns table (
  id bigint, town text, permit_no text, address text, work text, value numeric,
  issued_on date, first_seen timestamptz, state text, state_by text, state_at timestamptz,
  company text, company_role text,
  client_name text, client_cid text, client_phone text, client_jobs bigint, client_last_job date
)
language sql stable security invoker set search_path = public as $$
  with j as (
    select public.addr_key(address) as k, upper(btrim(city)) as c, name, client_cid, phone, date
    from jobs
    where coalesce(btrim(address), '') <> ''
      and upper(btrim(city)) in (select upper(pl.town) from permit_leads pl)
  )
  select pl.id, pl.town, pl.permit_no, pl.address, pl.work, pl.value,
         pl.issued_on, pl.first_seen, pl.state, pl.state_by, pl.state_at,
         pl.company, pl.company_role,
         m.client_name, m.client_cid, m.client_phone, m.client_jobs, m.client_last_job
  from permit_leads pl
  left join lateral (
    select (array_agg(j.name order by j.date desc nulls last))[1]       as client_name,
           (array_agg(j.client_cid order by j.date desc nulls last))[1] as client_cid,
           (array_agg(j.phone order by j.date desc nulls last))[1]      as client_phone,
           count(*)    as client_jobs,
           max(j.date) as client_last_job
    from j
    where j.k = pl.addr_key and j.c = upper(pl.town)
    having count(*) > 0
  ) m on true
  where pl.issued_on >= current_date - 120
  order by pl.issued_on desc, pl.id desc;
$$;
revoke all on function public.permit_leads_list() from anon, public;
grant execute on function public.permit_leads_list() to authenticated;
