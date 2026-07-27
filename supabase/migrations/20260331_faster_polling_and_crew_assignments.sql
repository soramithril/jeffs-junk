-- 1. Increase geofence-events polling from every 2 minutes to every 1 minute
--    so bin drop/pickup notifications appear faster on the dashboard.
SELECT cron.unschedule('geofence-events-poll');
SELECT cron.schedule(
  'geofence-events-poll',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/geofence-events'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <<SERVICE_ROLE_KEY_REMOVED_2026-07-27>>'
    ),
    body := '{"poll": true}'::jsonb
  );
  $$
);

-- 2. Crew members table — simple list of people who can be assigned to trucks
CREATE TABLE IF NOT EXISTS crew_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for crew_members" ON crew_members FOR ALL USING (true) WITH CHECK (true);

-- 3. Daily vehicle assignments — who is in what truck for a given day
CREATE TABLE IF NOT EXISTS vehicle_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vid TEXT NOT NULL,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vid, crew_member_id, assignment_date)
);

CREATE INDEX idx_vehicle_assignments_date ON vehicle_assignments (assignment_date);
CREATE INDEX idx_vehicle_assignments_vid ON vehicle_assignments (vid);

ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for vehicle_assignments" ON vehicle_assignments FOR ALL USING (true) WITH CHECK (true);
