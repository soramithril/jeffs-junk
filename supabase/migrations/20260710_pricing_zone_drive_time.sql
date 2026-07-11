-- Pricing page mirrors Jake's zone-based pricing doc (2026-07-10):
-- towns group into drive-time zone tiers, each town shows an approx drive time,
-- and the Zone 1 3-day special lives per-town in bins as "14 yard 3 day"
-- (the old grouped "Zone 1 3-Day" area row was deleted in the same change).
ALTER TABLE our_prices ADD COLUMN zone text, ADD COLUMN drive_time text;
