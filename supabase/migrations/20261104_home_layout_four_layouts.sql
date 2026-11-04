-- v715 added four homepage layouts (a-d) next to 'old'; 'new' is v711's single layout, read as 'a'.
-- Applied 2026-11-04 on Jake's yes: without it, picking A-D failed with
-- "violates check constraint user_profiles_home_layout_check".
alter table public.user_profiles drop constraint user_profiles_home_layout_check;
alter table public.user_profiles add constraint user_profiles_home_layout_check
  check (home_layout = any (array['new','old','a','b','c','d']));
