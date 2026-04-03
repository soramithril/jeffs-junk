-- Maintenance schedules: each row is a maintenance type for a vehicle
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vid TEXT NOT NULL,
  maintenance_type TEXT NOT NULL,
  interval_km INTEGER NOT NULL,
  last_service_km INTEGER DEFAULT 0,
  last_service_date DATE,
  next_due_km INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ok',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vehicle odometer readings from Geotab
CREATE TABLE IF NOT EXISTS vehicle_odometers (
  vid TEXT PRIMARY KEY,
  geotab_device_id TEXT,
  odometer_km INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Driver scores from Geotab
CREATE TABLE IF NOT EXISTS driver_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vid TEXT NOT NULL,
  driver_name TEXT DEFAULT '',
  period_date DATE NOT NULL,
  safety_score NUMERIC(5,1) DEFAULT 0,
  harsh_braking INTEGER DEFAULT 0,
  harsh_accel INTEGER DEFAULT 0,
  speeding_events INTEGER DEFAULT 0,
  seatbelt_off INTEGER DEFAULT 0,
  efficiency_score NUMERIC(5,1) DEFAULT 0,
  idle_minutes INTEGER DEFAULT 0,
  fuel_used_l NUMERIC(8,2) DEFAULT 0,
  distance_km NUMERIC(8,1) DEFAULT 0,
  productivity_score NUMERIC(5,1) DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  drive_minutes INTEGER DEFAULT 0,
  stop_minutes INTEGER DEFAULT 0,
  overall_score NUMERIC(5,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vid, period_date)
);

ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_odometers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for maintenance_schedules" ON maintenance_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for vehicle_odometers" ON vehicle_odometers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for driver_scores" ON driver_scores FOR ALL USING (true) WITH CHECK (true);

-- Schedule the telemetry poller every 6 hours
SELECT cron.schedule(
  'vehicle-telemetry-poll',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://okoqzbdyfjfgcdgmcamq.supabase.co/functions/v1/vehicle-telemetry'::text,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
