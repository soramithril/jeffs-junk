-- Follow-up to close_anon_reachable_endpoints.
-- Revoking from `anon` alone had no effect because the EXECUTE privilege was held
-- through PUBLIC, which anon inherits. Drop it at PUBLIC and re-grant only to
-- signed-in users, which is the only way app-advisor.js ever calls it.
REVOKE ALL ON FUNCTION public.get_advisor_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_advisor_data() TO authenticated;
