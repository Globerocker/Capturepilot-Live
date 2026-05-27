-- 090: Supabase advisor P0 security hardening
--
-- Closes three ERROR-level + three CRITICAL-WARN findings from the
-- Supabase advisor (audit run 2026-05-27):
--
-- 1. Three SECURITY DEFINER views on `opportunities_*` bypassed RLS
--    entirely. Switching to security_invoker means the view enforces the
--    *querying user's* RLS policies, not the view creator's.
-- 2. Three SECURITY DEFINER functions exposed via PostgREST /rest/v1/rpc/
--    were callable by both `anon` AND `authenticated` roles. That meant
--    any anonymous visitor could fire crons or wipe activity logs. We
--    REVOKE EXECUTE so only the `service_role` (used by trusted backend
--    code with the service key) can call them.

-- ---------------------------------------------------------------------------
-- Views — switch from SECURITY DEFINER to security_invoker
-- ---------------------------------------------------------------------------
alter view public.opportunities_attachable set (security_invoker = on);
alter view public.opportunities_deletable_archived set (security_invoker = on);
alter view public.opportunities_deletable_intelligence set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Functions — revoke EXECUTE from anon + authenticated
-- ---------------------------------------------------------------------------
revoke execute on function public.trigger_cron_route(text) from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.purge_old_activity_log() from anon, authenticated;

-- service_role retains EXECUTE by default (it's superuser-equivalent in
-- the Supabase REST layer). No grant needed.
