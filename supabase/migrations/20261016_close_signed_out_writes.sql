-- Close the signed-out door (2026-10-16, Jake: "fix all").
--
-- jobs_insert / clients_insert were left open to signed-out visitors on 2026-07-02 in
-- case a public website booking form ever sent bookings in. None does (Jake confirmed;
-- no job has arrived without a staff name on it since May 2026). The open door meant
-- anyone could add a booking whose "name" was script, which then ran in staff browsers.
-- referral_sources was readable and writable signed-out for the same reason.

drop policy jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert to authenticated with check (true);

drop policy clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated with check (true);

drop policy "Anyone can insert referral sources" on public.referral_sources;
drop policy "Anyone can read referral sources" on public.referral_sources;
create policy referral_sources_insert on public.referral_sources for insert to authenticated with check (true);
create policy referral_sources_read on public.referral_sources for select to authenticated using (true);

-- The two number counters only make sense for staff saving a booking. Revoke from PUBLIC
-- as well as anon: anon inherits PUBLIC, so revoking from anon alone changes nothing.
revoke all on function public.next_job_id(text) from public, anon;
revoke all on function public.next_client_cid() from public, anon;
grant execute on function public.next_job_id(text) to authenticated;
grant execute on function public.next_client_cid() to authenticated;
