-- Permit leads, round three (2026-11-20).
--
-- 1. What the company's own website says. The fetcher takes the web address
--    from the company's email on the permit (the part after the @, skipping
--    gmail and the like), opens that site and reads its public phone, email
--    and one-line description. company_checked marks a site as looked at, so
--    it is opened once, not every morning.
-- 2. How a call went. 'called' becomes three answers - booked, call back, no -
--    plus a call-back date and a note.
alter table public.permit_leads
  add column company_site    text,
  add column company_phone   text,
  add column company_email   text,
  add column company_about   text,
  add column company_checked timestamptz,
  add column call_back       date,
  add column note            text;

alter table public.permit_leads drop constraint permit_leads_state_check;
update public.permit_leads set state = 'no' where state = 'called';
alter table public.permit_leads add constraint permit_leads_state_check
  check (state in ('new', 'booked', 'callback', 'no', 'hanger', 'prospect', 'skip'));

drop function public.permit_leads_list();
create function public.permit_leads_list()
returns table (
  id bigint, town text, permit_no text, address text, work text, value numeric,
  issued_on date, first_seen timestamptz, state text, state_by text, state_at timestamptz,
  call_back date, note text,
  company text, company_role text, company_site text, company_phone text,
  company_email text, company_about text, company_jobs bigint,
  client_name text, client_cid text, client_phone text, client_jobs bigint, client_last_job date
)
language sql stable security invoker set search_path = public as $$
  with j as (
    select public.addr_key(address) as k, upper(btrim(city)) as c, name, client_cid, phone, date
    from jobs
    where coalesce(btrim(address), '') <> ''
      and upper(btrim(city)) in (select upper(pl.town) from permit_leads pl)
  ),
  -- Jobs we have already done under the company's own name, per company.
  co as (
    select c.company, (select count(*) from jobs jj where jj.name ilike c.company || '%') as n
    from (select distinct pl.company from permit_leads pl where length(pl.company) > 4) c
  )
  select pl.id, pl.town, pl.permit_no, pl.address, pl.work, pl.value,
         pl.issued_on, pl.first_seen, pl.state, pl.state_by, pl.state_at,
         pl.call_back, pl.note,
         pl.company, pl.company_role, pl.company_site, pl.company_phone,
         pl.company_email, pl.company_about, coalesce(co.n, 0),
         m.client_name, m.client_cid, m.client_phone, m.client_jobs, m.client_last_job
  from permit_leads pl
  left join co on co.company = pl.company
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
