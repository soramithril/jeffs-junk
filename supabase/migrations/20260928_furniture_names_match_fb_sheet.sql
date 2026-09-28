-- Furniture Bank "Product Pricing & Tax Receipt Value" sheet is the source of truth
-- for the 74 items it lists (Jake, 2026-09-28): names and prices must match it exactly.
-- 14 renames + Linens fee (a dash on the sheet -> 0).
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

do $$
begin
  if (select count(*) from furniture_prices where name in (
        'Bed Frame (Double/Twin)','Bed Frame (Queen)','Cabinet','Chair - Dining/Kitchen/Occasional',
        'DVD/VCR Player','Entertainment Unit','Mattress (Double)','Mattress (Queen)','Mattress (Twin)',
        'Stool - Dining/Kitchen','Table - Dining/Kitchen','Television Stand',
        'Television - Small Flat Screen (Under 32")','Television - Large Flat Screen (Over 32")')) <> 14
  then raise exception 'expected exactly 14 renamed furniture_prices rows';
  end if;
end $$;

commit;
