-- ============================================================
-- Migration 053 — Apply deferred schema cleanup
-- ============================================================
-- Historical context:
--   Migration 012 (Apr 1) was written to drop dead tables + opportunities
--   columns, but was never applied to production (verified via pg_dump on
--   2026-04-22 against project ryxgjzehoijjvczqkhwr). This migration finally
--   does what 012 intended, so the live DB matches the Bootstrap schema in
--   dashboard/supabase/schema/01_core_schema.sql.
--
-- DESTRUCTIVE — this drops tables and columns. Ensure backups first.
-- Rows counted on 2026-04-22 for all dropped tables/columns: 0.
-- ============================================================

-- Guard: abort if any of the dead tables actually contain data.
-- Uses to_regclass() so a table that's already been dropped (partial prior run,
-- or dropped manually) is silently skipped instead of raising 42P01.
DO $$
DECLARE
    t text;
    v_count bigint;
    dead_tables text[] := ARRAY[
        'public.locations',
        'public.outreach_drafts',
        'public.competitors',
        'public.competitor_intelligence'
    ];
BEGIN
    FOREACH t IN ARRAY dead_tables LOOP
        IF to_regclass(t) IS NULL THEN
            CONTINUE;  -- already dropped, nothing to check
        END IF;
        EXECUTE format('SELECT count(*) FROM %s', t) INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'Abort: % still contains % row(s). Inspect before dropping.', t, v_count;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------
-- 1. Drop empty / superseded tables
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.locations               CASCADE;  -- never populated
DROP TABLE IF EXISTS public.outreach_drafts         CASCADE;  -- superseded by outreach_prospects
DROP TABLE IF EXISTS public.competitor_intelligence CASCADE;  -- superseded by client_competitors
DROP TABLE IF EXISTS public.competitors             CASCADE;  -- superseded by client_competitors

-- ------------------------------------------------------------
-- 2. Drop FK columns on opportunities that were never populated
--    (ingest uses the text columns agency / set_aside_code / notice_type instead)
-- ------------------------------------------------------------
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS agency_id;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS set_aside_id;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS opportunity_type_id;

-- ------------------------------------------------------------
-- 3. Drop always-empty or superseded opportunities columns
-- ------------------------------------------------------------
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS additional_info_link;          -- always NULL
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS place_of_performance_country;  -- always NULL
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS ai_analysis;                   -- replaced by ai_win_strategy
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS active;                        -- replaced by is_archived + status

-- ------------------------------------------------------------
-- 4. Drop legacy Python scoring columns
--    Replaced by strategic_scoring jsonb + per-user user_matches.score
-- ------------------------------------------------------------
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS past_performance_score;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS notice_type_score;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS incumbent_risk_score;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS competitive_position_score;

-- ------------------------------------------------------------
-- 5. Drop orchestration scratch columns (tracked elsewhere now)
-- ------------------------------------------------------------
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS enrichment_status;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS enrichment_completed_at;
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS requirements_extracted;  -- merged into structured_requirements
ALTER TABLE public.opportunities DROP COLUMN IF EXISTS set_aside_types;         -- redundant with set_aside_code

-- ------------------------------------------------------------
-- 6. Truncate the legacy matches table (replaced by user_matches)
--    We keep the table because the per-user scoring CTEs still reference it
--    as a join target; zero it out so the query planner sees empty stats.
-- ------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.matches') IS NOT NULL THEN
        TRUNCATE TABLE public.matches;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 7. Fill set_asides lookup descriptions (idempotent)
-- ------------------------------------------------------------
UPDATE public.set_asides SET description = 'Small Business Set-Aside'              WHERE code = 'SBA'     AND description IS NULL;
UPDATE public.set_asides SET description = 'Small Business Partial Set-Aside'      WHERE code = 'SBP'     AND description IS NULL;
UPDATE public.set_asides SET description = '8(a) Sole Source'                      WHERE code = '8A'      AND description IS NULL;
UPDATE public.set_asides SET description = '8(a) Competed'                         WHERE code = '8AN'     AND description IS NULL;
UPDATE public.set_asides SET description = 'HUBZone Competed'                      WHERE code = 'HZC'     AND description IS NULL;
UPDATE public.set_asides SET description = 'HUBZone Sole Source'                   WHERE code = 'HZS'     AND description IS NULL;
UPDATE public.set_asides SET description = 'SDVOSB Competed'                       WHERE code = 'SDVOSBC' AND description IS NULL;
UPDATE public.set_asides SET description = 'SDVOSB Sole Source'                    WHERE code = 'SDVOSBS' AND description IS NULL;
UPDATE public.set_asides SET description = 'WOSB'                                  WHERE code = 'WOSB'    AND description IS NULL;
UPDATE public.set_asides SET description = 'WOSB Sole Source'                      WHERE code = 'WOSBSS'  AND description IS NULL;
UPDATE public.set_asides SET description = 'EDWOSB'                                WHERE code = 'EDWOSB'  AND description IS NULL;
UPDATE public.set_asides SET description = 'Veteran-Owned Small Business'          WHERE code = 'VSA'     AND description IS NULL;
UPDATE public.set_asides SET description = 'No Set-Aside'                          WHERE code = 'NONE'    AND description IS NULL;
