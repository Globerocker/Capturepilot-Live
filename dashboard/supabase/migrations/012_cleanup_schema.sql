-- 012: Database Schema Cleanup
-- Removes redundant columns, drops empty tables, cleans up 63-col opportunities table
-- Run AFTER backfill (tool 20) has extracted all data from raw_json

-- ============================================================
-- 1. Drop empty/unused tables
-- ============================================================
DROP TABLE IF EXISTS locations CASCADE;           -- 0 rows, never used
DROP TABLE IF EXISTS outreach_drafts CASCADE;     -- 0 rows, never used
DROP TABLE IF EXISTS competitor_intelligence CASCADE; -- 0 rows, replaced by client_competitors
DROP TABLE IF EXISTS competitors CASCADE;         -- 0 rows, replaced by client_competitors

-- ============================================================
-- 2. Drop redundant FK columns from opportunities
-- These FK columns reference lookup tables but were NEVER populated
-- by ingestion. The text columns (agency, set_aside_code, notice_type)
-- are used instead.
-- ============================================================
ALTER TABLE opportunities DROP COLUMN IF EXISTS agency_id;
ALTER TABLE opportunities DROP COLUMN IF EXISTS set_aside_id;
ALTER TABLE opportunities DROP COLUMN IF EXISTS opportunity_type_id;

-- ============================================================
-- 3. Drop always-empty or superseded columns
-- ============================================================
ALTER TABLE opportunities DROP COLUMN IF EXISTS additional_info_link;     -- always NULL
ALTER TABLE opportunities DROP COLUMN IF EXISTS place_of_performance_country; -- always NULL
ALTER TABLE opportunities DROP COLUMN IF EXISTS ai_analysis;              -- replaced by ai_win_strategy
ALTER TABLE opportunities DROP COLUMN IF EXISTS active;                   -- replaced by is_archived + status

-- ============================================================
-- 4. Drop legacy Python scoring columns
-- These per-opportunity scores were from tools/2_score_matches.py
-- (old pipeline). Dashboard uses per-user scores in user_matches.
-- ============================================================
ALTER TABLE opportunities DROP COLUMN IF EXISTS past_performance_score;
ALTER TABLE opportunities DROP COLUMN IF EXISTS notice_type_score;
ALTER TABLE opportunities DROP COLUMN IF EXISTS incumbent_risk_score;
ALTER TABLE opportunities DROP COLUMN IF EXISTS competitive_position_score;

-- ============================================================
-- 5. Merge redundant columns
-- enrichment_status → not needed (orchestrator tracks its own state)
-- enrichment_completed_at → not needed
-- requirements_extracted → merged into structured_requirements
-- set_aside_types → redundant with set_aside_code
-- ============================================================
ALTER TABLE opportunities DROP COLUMN IF EXISTS enrichment_status;
ALTER TABLE opportunities DROP COLUMN IF EXISTS enrichment_completed_at;
ALTER TABLE opportunities DROP COLUMN IF EXISTS requirements_extracted;
ALTER TABLE opportunities DROP COLUMN IF EXISTS set_aside_types;

-- ============================================================
-- 6. Clean up matches table (legacy, replaced by user_matches)
-- ============================================================
TRUNCATE TABLE matches;

-- ============================================================
-- 7. Fill set_asides lookup descriptions
-- ============================================================
UPDATE set_asides SET description = 'Small Business Set-Aside' WHERE code = 'SBA' AND description IS NULL;
UPDATE set_asides SET description = 'Small Business Partial Set-Aside' WHERE code = 'SBP' AND description IS NULL;
UPDATE set_asides SET description = '8(a) Sole Source' WHERE code = '8A' AND description IS NULL;
UPDATE set_asides SET description = '8(a) Competed' WHERE code = '8AN' AND description IS NULL;
UPDATE set_asides SET description = 'HUBZone Competed' WHERE code = 'HZC' AND description IS NULL;
UPDATE set_asides SET description = 'HUBZone Sole Source' WHERE code = 'HZS' AND description IS NULL;
UPDATE set_asides SET description = 'SDVOSB Competed' WHERE code = 'SDVOSBC' AND description IS NULL;
UPDATE set_asides SET description = 'SDVOSB Sole Source' WHERE code = 'SDVOSBS' AND description IS NULL;
UPDATE set_asides SET description = 'WOSB' WHERE code = 'WOSB' AND description IS NULL;
UPDATE set_asides SET description = 'WOSB Sole Source' WHERE code = 'WOSBSS' AND description IS NULL;
UPDATE set_asides SET description = 'EDWOSB' WHERE code = 'EDWOSB' AND description IS NULL;
UPDATE set_asides SET description = 'Veteran-Owned Small Business' WHERE code = 'VSA' AND description IS NULL;
UPDATE set_asides SET description = 'No Set-Aside' WHERE code = 'NONE' AND description IS NULL;

-- ============================================================
-- RESULT: opportunities table goes from 63 columns to ~45
-- Dropped: 18 redundant/empty columns
-- Kept: all actively used fields + strategic intelligence columns
-- ============================================================
