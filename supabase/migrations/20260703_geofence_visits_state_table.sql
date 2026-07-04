-- Per-job daily visit state for the breadcrumb-based geofence-events function (v16).
-- Written only by the edge function (service role); one row per job, reused across days.
-- (Applied to production 2026-07-03 via MCP apply_migration: geofence_visits_state_table.)
CREATE TABLE IF NOT EXISTS geofence_visits (
  job_id text PRIMARY KEY,
  device_id text,
  inside boolean NOT NULL DEFAULT false,
  entered_at timestamptz,
  exited_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE geofence_visits ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service-role access only.
