-- Opt-in office homepage (app-home.js, v711). Applied 2026-10-30 with Jake's OK.
-- One setting per person: null = never asked (the one-time popup is still due),
-- 'new' = new layout on, 'old' = said "Not now" or switched it off.
-- Staff can only READ their own user_profiles row (it carries their role), so the
-- choice is written through set_home_layout(), which can only touch the caller's
-- own home_layout. Adoption: select username, home_layout from user_profiles;
alter table public.user_profiles add column home_layout text check (home_layout in ('new','old'));
comment on column public.user_profiles.home_layout is 'Opt-in office homepage (app-home.js): null = never asked, new = on, old = said Not now or switched off';
create function public.set_home_layout(choice text) returns void
  language sql security definer set search_path = public as $$
  update public.user_profiles set home_layout = choice where id = auth.uid();
$$;
revoke all on function public.set_home_layout(text) from public, anon;
grant execute on function public.set_home_layout(text) to authenticated;
