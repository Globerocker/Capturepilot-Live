-- Phase 4 Migration: Sales Dossier UI & 100-Point Scoring Engine Schema Expansion
-- 1. opportunities: Add granular geo and strategic fields
ALTER TABLE opportunities
ADD COLUMN IF NOT EXISTS place_of_performance_city text,
    ADD COLUMN IF NOT EXISTS place_of_performance_zip text,
    ADD COLUMN IF NOT EXISTS place_of_performance_country text,
    ADD COLUMN IF NOT EXISTS set_aside_types jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS structured_requirements jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS strategic_scoring jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_win_strategy jsonb DEFAULT '{}'::jsonb;
-- 2. contractors: Add native activity and JSONB capacity fields
ALTER TABLE contractors
ADD COLUMN IF NOT EXISTS employee_count numeric,
    ADD COLUMN IF NOT EXISTS revenue numeric,
    ADD COLUMN IF NOT EXISTS service_radius_miles numeric DEFAULT 50,
    ADD COLUMN IF NOT EXISTS sam_registration_date timestamp with time zone,
    ADD COLUMN IF NOT EXISTS total_federal_awards numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_award_volume numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_award_date timestamp with time zone,
    ADD COLUMN IF NOT EXISTS federal_activity_status text,
    ADD COLUMN IF NOT EXISTS capacity_signals jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ownership jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS main_phone text,
    ADD COLUMN IF NOT EXISTS direct_phone text,
    ADD COLUMN IF NOT EXISTS hq_address text,
    ADD COLUMN IF NOT EXISTS city text;
-- state is already present
-- 3. capture_outcomes: Add detailed sales tracking
ALTER TABLE capture_outcomes
ADD COLUMN IF NOT EXISTS call_status text,
    ADD COLUMN IF NOT EXISTS follow_up_date timestamp with time zone,
    ADD COLUMN IF NOT EXISTS sales_notes text;
-- 4. matches: Add geographic context and breakdown
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS distance_miles numeric,
    ADD COLUMN IF NOT EXISTS score_breakdown jsonb DEFAULT '{}'::jsonb;