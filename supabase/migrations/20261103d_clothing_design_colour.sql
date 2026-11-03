-- A clothing design's colour (Jake, 2026-11-03: "color option grey black green and make it
-- so you can add colors"). Free text: the page offers Grey, Black, Green plus every colour
-- already used on a design, and "+ Add colour" for a new one. Required on save in the page.
-- The two Jeffs Junk tees take their colour from their names (it came from the old Notes);
-- the Jeff White Group designs never had one written down and start blank.
alter table public.jwg_clothing_designs add column colour text check (colour <> '');
update public.jwg_clothing_designs set colour = 'Grey'  where name = 'T-Shirt, grey'  and company = 'Jeffs Junk';
update public.jwg_clothing_designs set colour = 'Black' where name = 'T-Shirt, black' and company = 'Jeffs Junk';
