-- 095: drop the "*_admin = USING (true) WITH CHECK (true)" RLS policies
--
-- The Supabase advisor flagged 5 tables with policies that effectively
-- bypassed RLS for every role (USING true + WITH CHECK true, ALL command,
-- no specific role). These were probably leftover from early dev.
--
-- They're redundant because:
--   1. Admin UI calls use SUPABASE_SERVICE_KEY which bypasses RLS entirely
--      (service_role is the Supabase superuser-equivalent in the REST layer).
--   2. Each table also has a properly-scoped per-user policy (user_profile_id
--      tied to auth.uid()) that handles end-user access.
--
-- Dropping them tightens the actual enforcement boundary for signed-in
-- non-admin users without breaking anything (admin operations continue
-- via service key).
--
-- Also: company_analyses had `Allow anonymous insert on company_analyses`
-- with WITH CHECK true on INSERT for anon — intentional for the Quick
-- Checker, but should be rate-limited at the API layer. We DON'T remove
-- it here (it's load-bearing) but flag for future audit (rate-limiter at
-- /api/analyze-company).

drop policy if exists activity_admin     on public.client_activity_log;
drop policy if exists competitors_admin  on public.client_competitors;
drop policy if exists docs_admin         on public.client_documents;
drop policy if exists tasks_admin        on public.client_tasks;
drop policy if exists saved_searches_admin on public.saved_searches;

-- Sanity: make sure RLS is still enabled (admin policy drop doesn't disable RLS,
-- but be explicit).
alter table public.client_activity_log enable row level security;
alter table public.client_competitors  enable row level security;
alter table public.client_documents    enable row level security;
alter table public.client_tasks        enable row level security;
alter table public.saved_searches      enable row level security;
