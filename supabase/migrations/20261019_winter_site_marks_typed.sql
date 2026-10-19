-- Winter site marks get a type (Jake, 2026-10-19): the site plan editor now
-- draws sidewalks we plow as well as snow drop zones, so site_marks changes
-- from a list of [x, y, w, h] boxes to a list of
--   {"t":"zone","r":[x, y, w, h]}      drop zone box
--   {"t":"walk","p":[[x, y], ...]}     traced sidewalk line
-- This rewrites the 292 boxes drawn so far (44 sites) in place. Run it in the
-- same breath as merging the code that reads the new shape - the old code
-- cannot draw objects and the new code cannot draw bare arrays.
update jwg_service_locations
   set site_marks = (select jsonb_agg(jsonb_build_object('t', 'zone', 'r', m) order by ord)
                       from jsonb_array_elements(site_marks) with ordinality as e(m, ord))
 where jsonb_typeof(site_marks) = 'array'
   and jsonb_array_length(site_marks) > 0
   and jsonb_typeof(site_marks -> 0) = 'array';
