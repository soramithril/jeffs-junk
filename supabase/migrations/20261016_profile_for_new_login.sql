-- Logins are made only in Supabase (Authentication → Add user) — Jake, 2026-10-16:
-- "we dont need sign up at all i will sign them up on backend only". Public sign-up is
-- off and the dashboard's Add user form is gone.
--
-- Every login needs a user_profiles row before the dashboard can see it, so this trigger
-- writes one the moment a login is added: username from the part of the email before the
-- @, and NO role. With no role the login sees nothing (see 20261016_staff_only_access)
-- until someone picks its tier on the Users page.

create or replace function public.profile_for_new_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, username, role) values (new.id, split_part(new.email, '@', 1), null);
  return new;
end;
$$;

revoke all on function public.profile_for_new_login() from public, anon, authenticated;

create trigger profile_for_new_login
  after insert on auth.users
  for each row execute function public.profile_for_new_login();
