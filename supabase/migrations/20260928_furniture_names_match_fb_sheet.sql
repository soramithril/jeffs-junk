-- Furniture Bank "Product Pricing & Tax Receipt Value" sheet is the source of truth
-- for the 74 items it lists (Jake, 2026-09-28): names and prices must match it exactly.
-- 14 renames + Linens fee (a dash on the sheet -> 0), Bed Frame sizes, and every
-- item not on the sheet hidden, so the active list IS the sheet.
--
-- Run this RIGHT AFTER the matching app.js deploy lands on main. applyFurniturePrices
-- matches rows to DRD_ITEMS by name, so until both sides agree a renamed item shows twice.
begin;

update furniture_prices f set name = m.new_name
from (values
  ('Bed Frame - Double/Twin',               'Bed Frame (Double/Twin)'),
  ('Bed Frame - Queen',                     'Bed Frame (Queen)'),
  ('Large Cabinet',                         'Cabinet'),
  ('Chair - Dining / Kitchen / Occasional', 'Chair - Dining/Kitchen/Occasional'),
  ('DVD / VCR Player',                      'DVD/VCR Player'),
  ('Entertainment Unit - Large',            'Entertainment Unit'),
  ('Mattress - Double',                     'Mattress (Double)'),
  ('Mattress - Queen',                      'Mattress (Queen)'),
  ('Mattress - Twin',                       'Mattress (Twin)'),
  ('Stool - Dining / Kitchen',              'Stool - Dining/Kitchen'),
  ('Table - Dining / Kitchen',              'Table - Dining/Kitchen'),
  ('Television Stand - Small',              'Television Stand'),
  ('Television - Small Flat Screen',        'Television - Small Flat Screen (Under 32")'),
  ('Television - Large Flat Screen',        'Television - Large Flat Screen (Over 32")')
) as m(old_name, new_name)
where f.name = m.old_name;

update furniture_prices set fee = 0 where name = 'Linens (per bag)';

-- The two Bed Frames are the metal frames (Jake): take their cubic feet.
update furniture_prices set vol = 8  where name = 'Bed Frame (Double/Twin)';
update furniture_prices set vol = 12 where name = 'Bed Frame (Queen)';

-- Everything not on the sheet is hidden, never deleted: saved jobs store
-- quantities by position, and old jobs still show the hidden items they have.
update furniture_prices set active = false where name in (
  'Headboard','Throw Rug','Metal Bed Frame - Twin','Metal Bed Frame - Double','Metal Bed Frame - Queen',
  'Complete Bed Frame - Twin','Complete Bed Frame - Double','Complete Bed Frame - Queen','Small Cabinet',
  'Sofa - Extra Large','Recliner Sofa','Garment Rack','Plastic Storage Unit','Stepstool / Footstool',
  'Air Fryer','Blender','Coffee Maker','Countertop Dishwasher','Freezer','Humidifier / Dehumidifier',
  'Indoor Grill','Juicer','Sewing Machine','Steam Cleaner','Kitchen Cart / Tea Cart / Bar Cart',
  'Table - Nesting Set','Table - Console','Patio Table','Patio Chair / Side Table');

do $$
begin
  if (select count(*) from furniture_prices where name in (
        'Bed Frame (Double/Twin)','Bed Frame (Queen)','Cabinet','Chair - Dining/Kitchen/Occasional',
        'DVD/VCR Player','Entertainment Unit','Mattress (Double)','Mattress (Queen)','Mattress (Twin)',
        'Stool - Dining/Kitchen','Table - Dining/Kitchen','Television Stand',
        'Television - Small Flat Screen (Under 32")','Television - Large Flat Screen (Over 32")')) <> 14
  then raise exception 'expected exactly 14 renamed furniture_prices rows';
  end if;
  if (select count(*) from furniture_prices where active) <> 74
  then raise exception 'expected exactly the sheet''s 74 items active';
  end if;
end $$;

commit;
