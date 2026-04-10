-- Migration 019: Quick Checker Competitor Analysis
-- Adds a JSONB column to company_analyses for storing the top 5 competitors
-- discovered automatically during the Quick Checker pipeline.
--
-- The competitors payload is a JSON array of objects with shape:
--   {
--     name, uei, cage_code, sam_registered, naics_codes[],
--     naics_overlap_pct, total_awards, award_count,
--     first_award_date, last_award_date, top_agency,
--     strengths[], weaknesses[], state, source
--   }

ALTER TABLE public.company_analyses
    ADD COLUMN IF NOT EXISTS competitors JSONB;

COMMENT ON COLUMN public.company_analyses.competitors IS
    'Top 5 competitors auto-discovered from SAM.gov Entity API, USASpending, and the contractors table, with enrichment and inferred strengths/weaknesses.';
