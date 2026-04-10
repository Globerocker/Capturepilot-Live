-- Quick Checker enhancements
-- Adds manual NAICS selection, readiness score, and AI match summaries.
--
-- selected_naics_codes  : User/admin-confirmed NAICS codes used for scoring (1-2)
-- readiness_score       : 0-10 overall government contracting readiness
-- readiness_breakdown   : Component breakdown of what contributes to the score
-- ai_match_summaries    : Map of opportunity_id -> AI-generated fit summary

ALTER TABLE company_analyses
    ADD COLUMN IF NOT EXISTS selected_naics_codes TEXT[],
    ADD COLUMN IF NOT EXISTS readiness_score INTEGER,
    ADD COLUMN IF NOT EXISTS readiness_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS ai_match_summaries JSONB;

-- New status value: awaiting_naics_selection (text column, no enum update needed)
COMMENT ON COLUMN company_analyses.selected_naics_codes IS
    'NAICS codes explicitly selected by the user/admin for scoring (max 2)';
COMMENT ON COLUMN company_analyses.readiness_score IS
    'Government contracting readiness score, 0-10 scale';
COMMENT ON COLUMN company_analyses.readiness_breakdown IS
    'JSONB breakdown of readiness score components and factors';
COMMENT ON COLUMN company_analyses.ai_match_summaries IS
    'JSONB map of opportunity_id to AI-generated 2-3 sentence fit summaries';
