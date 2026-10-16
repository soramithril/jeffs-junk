-- Staff-only access (2026-10-16, Jake: "fix all" after the security re-check).
--
-- Before this, every table rule only asked "is this person signed in?". Public sign-up
-- was on, so anyone who found the site could make a login and read every client and job.
-- Now a login must also have a staff profile, and the profile's role decides the rest:
--   developer, owner, lead, office  read and change everything their other rules allow
--   display (Office TV)             reads, never changes anything
--   yard (Darrin's kiosk)           the two inventory tables only
--   no profile / unknown role       nothing
--
-- These are RESTRICTIVE rules: they sit on top of each table's existing rules and can
-- only take access away, so none of the existing rules needed editing. They apply to
-- signed-in requests only; the signed-out door is closed separately in
-- 20261016_close_signed_out_writes.sql. user_profiles keeps its own rules (everyone
-- reads their own profile; admins manage the rest).

create or replace function public.staff_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lower(role) from public.user_profiles where id = auth.uid()), '');
$$;

revoke all on function public.staff_tier() from public, anon;
grant execute on function public.staff_tier() to authenticated;

do $$
declare
  t record;
  readers text;
  writers text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'user_profiles'
  loop
    if t.relname in ('jwg_inventory_items', 'jwg_inventory_categories') then
      readers := $q$array['developer','owner','lead','office','display','yard']$q$;
      writers := $q$array['developer','owner','lead','office','yard']$q$;
    else
      readers := $q$array['developer','owner','lead','office','display']$q$;
      writers := $q$array['developer','owner','lead','office']$q$;
    end if;

    execute format('create policy staff_read on public.%I as restrictive for select to authenticated using ((select public.staff_tier()) = any (%s))', t.relname, readers);
    execute format('create policy staff_insert on public.%I as restrictive for insert to authenticated with check ((select public.staff_tier()) = any (%s))', t.relname, writers);
    execute format('create policy staff_update on public.%I as restrictive for update to authenticated using ((select public.staff_tier()) = any (%s)) with check ((select public.staff_tier()) = any (%s))', t.relname, writers, writers);
    execute format('create policy staff_delete on public.%I as restrictive for delete to authenticated using ((select public.staff_tier()) = any (%s))', t.relname, writers);
  end loop;
end $$;

-- Winter site photos are the only stored files. Same readers as the tables.
create policy staff_read on storage.objects as restrictive for select to authenticated
  using ((select public.staff_tier()) = any (array['developer','owner','lead','office','display']));

-- The AI advisor's data function ran with the owner's rights, so it skipped every table
-- rule above. Run it as the caller instead, so the same rules apply.
alter function public.get_advisor_data() security invoker;
