-- Tool 14: Fix Database Indexes & Cleanup
-- Run in Supabase SQL Editor
-- Date: 2026-03-16

-- =====================================================
-- PHASE 1: Fix broken/missing indexes
-- =====================================================

-- The idx_matches_score index is on pwin_score (always NULL)
-- Drop it and create one on the actual score column used
DROP INDEX IF EXISTS idx_matches_score;
CREATE INDEX IF NOT EXISTS idx_matches_score_actual ON matches (score DESC);

-- Add missing indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_opps_notice_type ON opportunities (notice_type);
CREATE INDEX IF NOT EXISTS idx_opps_set_aside_code ON opportunities (set_aside_code);
CREATE INDEX IF NOT EXISTS idx_opps_agency ON opportunities (agency);
CREATE INDEX IF NOT EXISTS idx_opps_is_archived ON opportunities (is_archived);
CREATE INDEX IF NOT EXISTS idx_opps_id_uuid ON opportunities (id);
CREATE INDEX IF NOT EXISTS idx_opps_place_state ON opportunities (place_of_performance_state);
CREATE INDEX IF NOT EXISTS idx_opps_description_type ON opportunities (description) WHERE description LIKE 'https://api.sam.gov%';

-- Matches: add classification index for HOT/WARM/COLD filtering
CREATE INDEX IF NOT EXISTS idx_matches_classification ON matches (classification);

-- Contacts: index on notice_id for joins
CREATE INDEX IF NOT EXISTS idx_contacts_notice_id ON contacts (notice_id);

-- Composite unique index to prevent duplicate matches
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_opp_contractor_unique
ON matches (opportunity_id, contractor_id);

-- Contractors: add index on is_sam_registered for filtering
CREATE INDEX IF NOT EXISTS idx_contractors_sam_registered ON contractors (is_sam_registered);

-- Contractors: add index on federal_activity_status for USASpending enrichment
CREATE INDEX IF NOT EXISTS idx_contractors_activity ON contractors (federal_activity_status);

-- =====================================================
-- PHASE 2: Add unique constraint on opportunity_attachments
-- =====================================================
-- Needed for upsert in attachment downloader
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'opportunity_attachments_opp_filename_unique'
    ) THEN
        ALTER TABLE opportunity_attachments
        ADD CONSTRAINT opportunity_attachments_opp_filename_unique
        UNIQUE (opportunity_id, filename);
    END IF;
END $$;

-- =====================================================
-- PHASE 3: Add missing columns for enrichment
-- =====================================================

-- Add years_in_business to contractors if not exists
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'contractors' AND column_name = 'years_in_business') THEN
        ALTER TABLE contractors ADD COLUMN years_in_business INTEGER;
    END IF;
END $$;

-- =====================================================
-- PHASE 4: Backfill opportunities.link from notice_id
-- =====================================================
UPDATE opportunities
SET link = 'https://sam.gov/opp/' || notice_id || '/view'
WHERE link IS NULL AND notice_id IS NOT NULL;

-- =====================================================
-- SUMMARY: Run ANALYZE to update query planner stats
-- =====================================================
ANALYZE opportunities;
ANALYZE matches;
ANALYZE contractors;
ANALYZE contacts;
