-- permit_leads_list: same rows, 42 s -> 1.3 s (2026-11-21).
--
-- The old version matched every permit lead against past jobs one lead at a
-- time, and the planner re-ran addr_key() (18 regexes) over ~13,400 jobs for
-- each of the 328 leads. Signed-in users have an 8 s statement timeout, so the
-- Permit leads tab and (since v770) the Prospects page never finished loading.
--
-- Now the jobs list is built ONCE (materialized), grouped by address + town,
-- and joined. Checked against the old function on live data before the swap:
-- 328 rows each, zero rows different in either direction.

create or replace function public.permit_leads_list()
 returns table(id bigint, town text, permit_no text, address text, work text, value numeric, issued_on date, first_seen timestamp with time zone, state text, state_by text, state_at timestamp with time zone, call_back date, note text, company text, company_role text, company_site text, company_phone text, company_email text, company_about text, company_jobs bigint, client_name text, client_cid text, client_phone text, client_jobs bigint, client_last_job date)
 language sql
 stable
 set search_path to 'public'
as $function$
  with j as materialized (
    select public.addr_key(address) as k, upper(btrim(city)) as c, name, client_cid, phone, date
    from jobs
    where coalesce(btrim(address), '') <> ''
      and upper(btrim(city)) in (select upper(pl.town) from permit_leads pl)
  ),
  m as (
    select j.k, j.c,
           (array_agg(j.name order by j.date desc nulls last))[1]       as client_name,
           (array_agg(j.client_cid order by j.date desc nulls last))[1] as client_cid,
           (array_agg(j.phone order by j.date desc nulls last))[1]      as client_phone,
           count(*)    as client_jobs,
           max(j.date) as client_last_job
    from j
    group by j.k, j.c
  ),
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
  left join m on m.k = pl.addr_key and m.c = upper(pl.town)
  where pl.issued_on >= current_date - 120
  order by pl.issued_on desc, pl.id desc;
$function$;
