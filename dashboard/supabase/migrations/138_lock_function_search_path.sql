-- Migration 138 — Lock search_path on 16 SECURITY DEFINER + trigger functions
--
-- 2026-06-10 platform-audit advisor flagged 16 functions with role-mutable
-- search_path. The risk: a SECURITY DEFINER function called via REST resolves
-- bare schema references against the *caller's* search_path. An attacker who
-- can shadow a public-schema name in another schema (or who sees the
-- function's plan get re-cached after a tenant tampers with search_path) can
-- hijack execution and read/write outside the intended schema.
--
-- Fix: pin each function's search_path to `pg_catalog, public` via
--      ALTER FUNCTION ... SET search_path = ...
--
-- Each ALTER is wrapped in a DO block with EXCEPTION WHEN undefined_function
-- so a missing/renamed function doesn't fail the whole migration. (Some of
-- these were added in 086, 119, etc. and may have been renamed in branch
-- environments; we want the migration to be safely re-runnable.)
--
-- Functions affected (signatures pulled from the migrations that created
-- them, see the comment next to each line):

DO $$ BEGIN
    ALTER FUNCTION public.sync_is_archived_from_status()
        SET search_path = pg_catalog, public;            -- 010_strategic_intelligence
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.sync_status_from_archived()
        SET search_path = pg_catalog, public;            -- 010_strategic_intelligence
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.touch_proposal_jobs_updated_at()
        SET search_path = pg_catalog, public;            -- 026_proposal_jobs
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.touch_background_jobs_updated_at()
        SET search_path = pg_catalog, public;            -- 056_background_jobs
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.trigger_cron_route(text)
        SET search_path = pg_catalog, public;            -- 057_pg_cron_triggers (SECURITY DEFINER)
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.tg_government_contacts_updated_at()
        SET search_path = pg_catalog, public;            -- 065_government_contacts
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.tg_rss_sources_updated_at()
        SET search_path = pg_catalog, public;            -- 066_rss_sources
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public._touch_backlink_updated_at()
        SET search_path = pg_catalog, public;            -- 069_backlink_pipeline
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.purge_old_activity_log()
        SET search_path = pg_catalog, public;            -- 071_plan_tiers (SECURITY DEFINER)
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.get_sled_rows_needing_enrichment(text[], int, int)
        SET search_path = pg_catalog, public;            -- 085_short_desc_sled_fn
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.enqueue_opp_enrichment()
        SET search_path = pg_catalog, public;            -- 086_worker_jobs_platform
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.claim_jobs(text[], int)
        SET search_path = pg_catalog, public;            -- 086_worker_jobs_platform
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.finish_job(uuid, text, jsonb, text)
        SET search_path = pg_catalog, public;            -- 086_worker_jobs_platform
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.rl_bump(text)
        SET search_path = pg_catalog, public;            -- 109_rate_limit_buckets (SECURITY DEFINER)
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.changelog_touch_updated_at()
        SET search_path = pg_catalog, public;            -- 110_changelog
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
    ALTER FUNCTION public.reap_stale_jobs(interval)
        SET search_path = pg_catalog, public;            -- 119_worker_jobs_reaper
EXCEPTION WHEN undefined_function THEN NULL; END $$;

notify pgrst, 'reload schema';
