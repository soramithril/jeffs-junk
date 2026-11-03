-- How a clothing design's logo is put on (Jake, 2026-11-03: "add a type embroidered or
-- screen printed"). The page asks for it on every new or changed design. The 4 designs made
-- from the June records start blank; Sam picks it when she adds their photos.
alter table public.jwg_clothing_designs
  add column logo text check (logo in ('Embroidered', 'Screen printed'));
