-- Permit leads (2026-11-19): building permits the towns publish, pulled in by the
-- permit-leads-sync edge function, shown under Prospects.
--
-- The public lists carry an address, the work and a date - never a name or a
-- phone number. So the one lead that can be phoned straight away is a permit at
-- an address we have already done a job at; permit_leads_list() finds those.

-- One spelling per address so "20 Prince of Wales Drive" (a job) meets
-- "20 PRINCE OF WALES DR" (the city). Anything after a comma is dropped.
create function public.addr_key(a text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(
      regexp_replace(upper(split_part(coalesce(a, ''), ',', 1)), '[^A-Z0-9 ]', ' ', 'g'),
      '\mSTREET\M', 'ST', 'g'),    '\mAVENUE\M', 'AVE', 'g'),
      '\mDRIVE\M', 'DR', 'g'),     '\mROAD\M', 'RD', 'g'),
      '\mCRESCENT\M', 'CRES', 'g'),'\m(COURT|CT)\M', 'CRT', 'g'),
      '\mBOULEVARD\M', 'BLVD', 'g'),'\mLANE\M', 'LN', 'g'),
      '\mPLACE\M', 'PL', 'g'),     '\mCIRCLE\M', 'CIR', 'g'),
      '\mTRAIL\M', 'TRL', 'g'),    '\mTERRACE\M', 'TERR', 'g'),
      '\mPARKWAY\M', 'PKWY', 'g'), '\mNORTH\M', 'N', 'g'),
      '\mSOUTH\M', 'S', 'g'),      '\mEAST\M', 'E', 'g'),
      '\mWEST\M', 'W', 'g'),
    '\s+', ' ', 'g'));
$$;

create table public.permit_leads (
  id         bigint generated always as identity primary key,
  town       text not null,
  permit_no  text not null,
  address    text not null,
  addr_key   text generated always as (public.addr_key(address)) stored,
  work       text not null,
  value      numeric,                       -- construction value; Barrie does not publish one
  issued_on  date not null,
  first_seen timestamptz not null default now(),
  state      text not null default 'new'
             check (state in ('new', 'called', 'hanger', 'prospect', 'skip')),
  state_by   text,
  state_at   timestamptz,
  unique (town, permit_no)
);
create index permit_leads_issued on public.permit_leads(issued_on desc);

alter table public.permit_leads enable row level security;

-- Office staff read every lead and mark what was done with it. Only the edge
-- function (secret key) adds rows; nobody deletes.
create policy staff_read on public.permit_leads for select to authenticated
  using ((select staff_tier()) = any (array['developer','owner','lead','office']));
create policy staff_update on public.permit_leads for update to authenticated
  using ((select staff_tier()) = any (array['developer','owner','lead','office']))
  with check ((select staff_tier()) = any (array['developer','owner','lead','office']));

revoke all on public.permit_leads from anon;
revoke insert, delete, truncate on public.permit_leads from authenticated;

-- What the Permit leads screen reads: the last 120 days of permits, each with
-- the customer at that address if there is one. Runs as the caller, so the
-- policies on permit_leads and jobs still decide who sees what.
create function public.permit_leads_list()
returns table (
  id bigint, town text, permit_no text, address text, work text, value numeric,
  issued_on date, first_seen timestamptz, state text, state_by text, state_at timestamptz,
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

-- Every morning at 11:15 UTC: 6:15 am in winter, 7:15 am in summer. An hour
-- either way does not matter here, so no Ontario-clock wrapper.
select cron.schedule('permit-leads-daily', '15 11 * * *', $$
  select net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/permit-leads-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.cron_config where key = 'edge_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
