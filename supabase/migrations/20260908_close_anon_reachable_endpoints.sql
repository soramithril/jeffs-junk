-- Close the database entry points that were reachable without signing in.
-- Verified 2026-09-08: none of these are called by the app.

-- 1. auto_drop_bins: SECURITY DEFINER, callable by anon, rewrote bin_instatus with no
--    cancelled-job filter. The app stopped calling it (see the comment at app.js:1690,
--    where it is recorded as the cause of bin 20-07 sitting unbookable for seven weeks).
REVOKE ALL ON FUNCTION public.auto_drop_bins(text[]) FROM PUBLIC, anon, authenticated;

-- 2. jarvis_schedule: unused view, readable by anon, exposing job date/time/service/
--    status/city/crew size for the last 7 and next 30 days.
REVOKE ALL ON public.jarvis_schedule FROM anon, authenticated;

-- 3. get_advisor_data: only ever called from app-advisor.js by a signed-in user.
--    Signed-in access is kept; anonymous access is not.
REVOKE EXECUTE ON FUNCTION public.get_advisor_data() FROM anon;
