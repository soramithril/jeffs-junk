-- ═══════════════════════════════════════════════════════════════════
-- Crew-based driver scoring with time-based assignments & cornering
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add cornering column to existing driver_scores
ALTER TABLE driver_scores ADD COLUMN IF NOT EXISTS cornering_events INTEGER DEFAULT 0;

-- 2. Individual safety events with timestamps (for crew attribution)
CREATE TABLE safety_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vid TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('harsh_braking','harsh_accel','speeding','seatbelt_off','cornering')),
  event_time TIMESTAMPTZ NOT NULL,
  period_date DATE NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_safety_events_date ON safety_events (period_date);
CREATE INDEX idx_safety_events_vid_date ON safety_events (vid, period_date);
CREATE INDEX idx_safety_events_crew ON safety_events (crew_member_id, period_date);

ALTER TABLE safety_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for safety_events" ON safety_events FOR ALL USING (true) WITH CHECK (true);

-- 3. Add time columns to vehicle_assignments
ALTER TABLE vehicle_assignments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE vehicle_assignments ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Backfill: set started_at from assignment_date for existing rows
UPDATE vehicle_assignments
SET started_at = assignment_date::timestamptz + interval '8 hours'
WHERE started_at IS NULL;

-- 4. Crew driver scores: daily aggregates per person
CREATE TABLE crew_driver_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  safety_score NUMERIC(5,1) DEFAULT 0,
  harsh_braking INTEGER DEFAULT 0,
  harsh_accel INTEGER DEFAULT 0,
  speeding_events INTEGER DEFAULT 0,
  seatbelt_off INTEGER DEFAULT 0,
  cornering_events INTEGER DEFAULT 0,
  total_events INTEGER DEFAULT 0,
  distance_km NUMERIC(8,1) DEFAULT 0,
  drive_minutes INTEGER DEFAULT 0,
  vehicles_driven TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crew_member_id, period_date)
);

CREATE INDEX idx_crew_driver_scores_date ON crew_driver_scores (period_date);
CREATE INDEX idx_crew_driver_scores_crew_date ON crew_driver_scores (crew_member_id, period_date);

ALTER TABLE crew_driver_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for crew_driver_scores" ON crew_driver_scores FOR ALL USING (true) WITH CHECK (true);
