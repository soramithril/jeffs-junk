-- Clothing stock: how many of each design are on hand, per size (Jake, 2026-11-03: "keep
-- track of how many we have with sizes so we can keep track of what we have").
--
-- stock is {"L": 3, "XL": 0, ...}. A size that has never been counted has no key. Every change
-- goes through clothing_stock_change(), which locks the row, so two people tapping + at once
-- (or a hand-out landing during a recount) cannot overwrite each other. Counts never go below
-- zero: handing out the last-but-none just leaves 0, and the page says to recount.
--   p_add: {"L": -2, "XL": 5}  added to what is there (hand-outs, deliveries, + and -)
--   p_set: {"L": 4}            exact counts (a recount); applied before p_add
-- SECURITY INVOKER, so the table's own rules decide who may change stock (office and up).

alter table public.jwg_clothing_designs add column stock jsonb not null default '{}'::jsonb;

create function public.clothing_stock_change(p_design uuid, p_add jsonb default '{}', p_set jsonb default '{}')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  s jsonb;
  k text;
begin
  select stock into s from public.jwg_clothing_designs where id = p_design for update;
  if not found then
    raise exception 'Unknown clothing design %', p_design;
  end if;
  for k in select jsonb_object_keys(p_set) loop
    s := jsonb_set(s, array[k], to_jsonb(greatest(0, (p_set->>k)::int)));
  end loop;
  for k in select jsonb_object_keys(p_add) loop
    s := jsonb_set(s, array[k], to_jsonb(greatest(0, coalesce((s->>k)::int, 0) + (p_add->>k)::int)));
  end loop;
  update public.jwg_clothing_designs set stock = s where id = p_design;
  return s;
end;
$$;

revoke execute on function public.clothing_stock_change(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.clothing_stock_change(uuid, jsonb, jsonb) to authenticated;
