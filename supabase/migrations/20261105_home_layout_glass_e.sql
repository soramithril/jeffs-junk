-- Homepage option E (Jake, 2026-11-05): the old layout in the glass look (app-glass.js).
-- Without 'e' in the list, picking E fails with
-- "violates check constraint user_profiles_home_layout_check", as A-D did on 2026-11-04.
alter table public.user_profiles drop constraint user_profiles_home_layout_check;
alter table public.user_profiles add constraint user_profiles_home_layout_check
  check (home_layout = any (array['new','old','a','b','c','d','e']));
