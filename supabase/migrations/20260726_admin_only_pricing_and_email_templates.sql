-- Applied to the live project 2026-07-26 (migration: admin_only_pricing_and_email_templates).
--
-- The bin pricing sheet, the furniture quote values and the seven customer email templates could
-- be changed by ANY signed-in account. Only the menu hid those pages from Kelly, Rachel and Josh
-- — the database accepted the write. This makes it an actual rule.
--
-- Reading stays open to every signed-in user: staff need prices to quote a job and templates to
-- send an email. Only changing is restricted.
--
-- Admin = user_profiles.role of 'admin', compared case-insensitively because the column holds
-- 'admin', 'user', 'User' and 'display'. That is Jake, Barbara and Sam today.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and lower(coalesce(role, '')) = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;

-- Bin pricing sheet (47 town rows)
drop policy "our_prices_insert" on our_prices;
create policy "our_prices_insert" on our_prices for insert to authenticated with check (public.is_admin());
drop policy "our_prices_update" on our_prices;
create policy "our_prices_update" on our_prices for update to authenticated using (public.is_admin());

-- Furniture quote calculator values (109 items)
drop policy "Authenticated insert furniture_prices" on furniture_prices;
create policy "furniture_prices_insert" on furniture_prices for insert to authenticated with check (public.is_admin());
drop policy "Authenticated update furniture_prices" on furniture_prices;
create policy "furniture_prices_update" on furniture_prices for update to authenticated using (public.is_admin());

-- The seven customer email templates
drop policy "Authenticated users can upsert email_presets" on email_presets;
create policy "email_presets_insert" on email_presets for insert to authenticated with check (public.is_admin());
drop policy "Authenticated users can update email_presets" on email_presets;
create policy "email_presets_update" on email_presets for update to authenticated using (public.is_admin());
