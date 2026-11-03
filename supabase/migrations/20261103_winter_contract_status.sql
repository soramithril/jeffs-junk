-- Winter contract status per site: confirmed or pending (Jake, 2026-11-03).
-- Every existing site starts as pending; Jake confirms them in the Winter list.
alter table public.jwg_service_locations
  add column winter_contract text not null default 'pending'
  check (winter_contract in ('confirmed','pending'));
