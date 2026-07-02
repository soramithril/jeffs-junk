-- Close the public-key (anon) read/write holes on the core junk tables.
-- Applied to the live project 2026-07-02 with Jake's approval.
-- Booking INSERTs (jobs_insert / clients_insert) deliberately stay open so a
-- public booking form keeps working.
drop policy "jobs_select" on jobs;
create policy "jobs_select" on jobs for select to authenticated using (true);
drop policy "jobs_update" on jobs;
create policy "jobs_update" on jobs for update to authenticated using (true);
drop policy "clients_select" on clients;
create policy "clients_select" on clients for select to authenticated using (true);
drop policy "clients_update" on clients;
create policy "clients_update" on clients for update to authenticated using (true);
drop policy "Allow anon full access to bin_history" on bin_history;
drop policy "Authenticated users can insert job_changes" on job_changes;
create policy "job_changes_insert" on job_changes for insert to authenticated with check (true);
