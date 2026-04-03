-- Add open-ended block support to vehicle_blocks.
-- When a vehicle is blocked with no end date, open_ended=true and open_from
-- records the start date. The dashboard auto-extends these blocks daily.

ALTER TABLE vehicle_blocks ADD COLUMN IF NOT EXISTS open_ended BOOLEAN DEFAULT false;
ALTER TABLE vehicle_blocks ADD COLUMN IF NOT EXISTS open_from TEXT DEFAULT NULL;
