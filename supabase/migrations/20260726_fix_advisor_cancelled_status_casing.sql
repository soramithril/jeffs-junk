-- Applied to the live project 2026-07-26 (migration: fix_advisor_cancelled_status_casing).
--
-- get_advisor_data() compared jobs.status against 'cancelled' (lowercase). The column only ever
-- holds '', 'Cancelled' or 'Postponed' — enforced by the jobs_status_allowed CHECK constraint — so:
--   * all 26 "status != 'cancelled'" filters excluded nothing, and every Business Advisor metric
--     (monthly/quarterly/YoY totals, city rankings, bin demand and duration, repeat and lapsed
--     customers, top customers, service mix, quote conversion, lead time, day-of-week, peak days,
--     overdue bins, commercial split) silently counted the 56 cancelled jobs
--   * the 3 "status = 'cancelled'" comparisons in the cancellation panel always returned 0
--
-- The fix rewrites the function in place from its own live definition, changing only those string
-- literals, so the remainder of the ~200-line body is guaranteed byte-identical to what was
-- running. It asserts the expected count before and after rather than trusting the replace.
--
-- Verified after applying:
--   get_advisor_data()->>'total_jobs'                      = 20575  (= count where status <> 'Cancelled')
--   get_advisor_data()->'cancellations'->>'total_cancelled' =    56  (= count where status =  'Cancelled')

DO $mig$
DECLARE src text; n_before int; n_after int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_advisor_data';

  IF src IS NULL THEN
    RAISE EXCEPTION 'get_advisor_data() not found';
  END IF;

  n_before := (length(src) - length(replace(src, 'status != ''cancelled''', ''))) / length('status != ''cancelled''')
            + (length(src) - length(replace(src, 'status = ''cancelled''',  ''))) / length('status = ''cancelled''');

  src := replace(src, 'status != ''cancelled''', 'status != ''Cancelled''');
  src := replace(src, 'status = ''cancelled''',  'status = ''Cancelled''');

  n_after := (length(src) - length(replace(src, 'status != ''cancelled''', ''))) / length('status != ''cancelled''')
           + (length(src) - length(replace(src, 'status = ''cancelled''',  ''))) / length('status = ''cancelled''');

  IF n_before <> 29 THEN
    RAISE EXCEPTION 'expected 29 lowercase comparisons, found %', n_before;
  END IF;
  IF n_after <> 0 THEN
    RAISE EXCEPTION 'replacement incomplete, % remain', n_after;
  END IF;

  EXECUTE src;
END
$mig$;
