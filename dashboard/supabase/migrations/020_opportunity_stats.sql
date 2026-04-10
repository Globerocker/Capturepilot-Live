-- Opportunity landscape stats for Quick Checker results page
--
-- opportunity_stats : Pre-computed aggregated pipeline stats (per NAICS, per state)
--                     surfaced on the Quick Checker results page to motivate
--                     sign-ups. Structure:
--                     {
--                       total_opportunities: int,
--                       total_estimated_value: number,
--                       hot_matches: int,
--                       warm_matches: int,
--                       total_matches: int,
--                       state_count: int,
--                       by_naics: [{ code, label, count, total_value }],
--                       by_state: [{ state, count, total_value }],
--                       states: string[],
--                       naics_codes: string[]
--                     }

ALTER TABLE company_analyses
    ADD COLUMN IF NOT EXISTS opportunity_stats JSONB;

COMMENT ON COLUMN company_analyses.opportunity_stats IS
    'Aggregated opportunity landscape stats used by the Quick Checker results page — totals by NAICS and state, plus HOT/WARM match counts.';
