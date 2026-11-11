-- Winter site marks become outlines (Jake, 2026-11-11): the site plan editor now
-- draws any shape, by hand or corner to corner, and has more kinds of mark
-- (don't pile, keep clear, push arrow, hazard, salt bin). Every mark is now
--   {"t": kind, "p": [[x, y], ...], "n": "optional note"}
-- so a drop zone stops being a box {"t":"zone","r":[x, y, w, h]} and becomes the
-- four corners of that box. Sidewalks ({"t":"walk","p":[...]}) are already in
-- the new shape. Run it in the same breath as merging the code that reads the new
-- shape - the old code cannot draw a zone without "r" and the new code cannot
-- draw one without "p".
update jwg_service_locations
   set site_marks = (
     select jsonb_agg(
              case when m ? 'r' then jsonb_build_object('t', m -> 't', 'p', jsonb_build_array(
                     jsonb_build_array((m -> 'r' ->> 0)::numeric, (m -> 'r' ->> 1)::numeric),
                     jsonb_build_array((m -> 'r' ->> 0)::numeric + (m -> 'r' ->> 2)::numeric, (m -> 'r' ->> 1)::numeric),
                     jsonb_build_array((m -> 'r' ->> 0)::numeric + (m -> 'r' ->> 2)::numeric, (m -> 'r' ->> 1)::numeric + (m -> 'r' ->> 3)::numeric),
                     jsonb_build_array((m -> 'r' ->> 0)::numeric, (m -> 'r' ->> 1)::numeric + (m -> 'r' ->> 3)::numeric)))
                   else m end
              order by ord)
       from jsonb_array_elements(site_marks) with ordinality as e(m, ord))
 where jsonb_typeof(site_marks) = 'array'
   and exists (select 1 from jsonb_array_elements(site_marks) as x(m) where m ? 'r');
