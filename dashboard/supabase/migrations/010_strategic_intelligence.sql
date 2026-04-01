-- 010: Strategic Intelligence Database Transformation
-- Adds lifecycle status model, strategic flags, and retention protection
-- Backwards compatible: bidirectional triggers keep is_archived in sync

-- ============================================================
-- 1. Lifecycle Status Enum
-- ============================================================
DO $$ BEGIN
    CREATE TYPE opportunity_status AS ENUM (
        'SEARCH_SEED',       -- Forecast / early signal
        'DISCOVERED',        -- Newly ingested, not yet classified
        'QUALIFIED',         -- Passed relevance filters
        'ACTIVE',            -- Open, deadline in the future
        'EXPIRING_SOON',     -- Deadline within 7 days
        'MARKET_RESEARCH',   -- Sources Sought / RFI (pre-deadline)
        'INTELLIGENCE',      -- Sources Sought / RFI (post-deadline, retained)
        'EXPIRED',           -- Deadline passed
        'AWARDED',           -- Award detected (never delete)
        'ARCHIVED',          -- Expired > 120 days, pending deletion
        'DELETED'            -- Soft-deleted (hard delete via cleanup)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DISCOVERED';

-- ============================================================
-- 2. New Strategic Columns
-- ============================================================
ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS sub_agency TEXT,
    ADD COLUMN IF NOT EXISTS office TEXT,
    ADD COLUMN IF NOT EXISTS estimated_value NUMERIC,
    ADD COLUMN IF NOT EXISTS follow_on_flag BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS sources_sought_flag BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS veteran_relevance_flag BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS small_business_relevance_flag BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS opportunity_score INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS related_notice_id TEXT,
    ADD COLUMN IF NOT EXISTS retention_protected BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS retention_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 3. Backfill status from existing is_archived + deadline
-- ============================================================
UPDATE opportunities SET status = 'ARCHIVED' WHERE is_archived = true;
UPDATE opportunities SET status = 'ACTIVE'
    WHERE is_archived = false AND response_deadline > now();
UPDATE opportunities SET status = 'EXPIRED'
    WHERE is_archived = false AND response_deadline <= now() AND response_deadline IS NOT NULL;
UPDATE opportunities SET status = 'DISCOVERED'
    WHERE is_archived = false AND response_deadline IS NULL;

-- ============================================================
-- 4. Backfill flags from existing data
-- ============================================================

-- Sources Sought flag
UPDATE opportunities SET sources_sought_flag = true
WHERE notice_type ILIKE '%Sources Sought%'
   OR notice_type ILIKE '%RFI%'
   OR notice_type = 'r';

-- Small Business relevance
UPDATE opportunities SET small_business_relevance_flag = true
WHERE set_aside_code IS NOT NULL
  AND set_aside_code != ''
  AND set_aside_code NOT ILIKE '%none%'
  AND set_aside_code NOT ILIKE '%Total%';

-- Veteran relevance
UPDATE opportunities SET veteran_relevance_flag = true
WHERE set_aside_code ILIKE '%SDVOSB%'
   OR set_aside_code ILIKE '%VOSB%'
   OR set_aside_code ILIKE '%Veteran%'
   OR set_aside_code ILIKE '%Service-Disabled%';

-- Sources Sought past deadline → MARKET_RESEARCH / INTELLIGENCE
UPDATE opportunities SET status = 'INTELLIGENCE'
WHERE sources_sought_flag = true AND response_deadline < now();
UPDATE opportunities SET status = 'MARKET_RESEARCH'
WHERE sources_sought_flag = true AND response_deadline > now();

-- ============================================================
-- 5. Retention protection for valuable intelligence
-- ============================================================
UPDATE opportunities SET retention_protected = true, retention_reason = 'incumbent_data'
WHERE incumbent_contractor_name IS NOT NULL AND incumbent_contractor_name != '';

UPDATE opportunities SET retention_protected = true, retention_reason = 'award_history'
WHERE award_amount IS NOT NULL AND award_amount > 0;

UPDATE opportunities SET retention_protected = true, retention_reason = 'strategic_scoring'
WHERE strategic_scoring IS NOT NULL;

UPDATE opportunities SET retention_protected = true, retention_reason = 'ai_strategy'
WHERE ai_win_strategy IS NOT NULL;

-- ============================================================
-- 6. Bidirectional sync triggers (backwards compatibility)
-- ============================================================

-- Trigger: status change → update is_archived
CREATE OR REPLACE FUNCTION sync_is_archived_from_status() RETURNS TRIGGER AS $$
BEGIN
    NEW.is_archived := NEW.status IN ('ARCHIVED', 'DELETED', 'EXPIRED');
    NEW.status_changed_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_is_archived ON opportunities;
CREATE TRIGGER trg_sync_is_archived
    BEFORE INSERT OR UPDATE OF status ON opportunities
    FOR EACH ROW EXECUTE FUNCTION sync_is_archived_from_status();

-- Trigger: is_archived change → update status
CREATE OR REPLACE FUNCTION sync_status_from_archived() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_archived = true AND OLD.is_archived = false THEN
        IF NEW.status NOT IN ('ARCHIVED', 'DELETED', 'EXPIRED', 'AWARDED', 'INTELLIGENCE') THEN
            NEW.status := 'ARCHIVED';
        END IF;
    END IF;
    IF NEW.is_archived = false AND OLD.is_archived = true THEN
        IF NEW.status IN ('ARCHIVED', 'DELETED', 'EXPIRED') THEN
            NEW.status := 'ACTIVE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_status_from_archived ON opportunities;
CREATE TRIGGER trg_sync_status_from_archived
    BEFORE UPDATE OF is_archived ON opportunities
    FOR EACH ROW EXECUTE FUNCTION sync_status_from_archived();

-- ============================================================
-- 7. Indexes for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_opps_status ON opportunities (status);
CREATE INDEX IF NOT EXISTS idx_opps_status_deadline ON opportunities (status, response_deadline);
CREATE INDEX IF NOT EXISTS idx_opps_sources_sought ON opportunities (sources_sought_flag) WHERE sources_sought_flag = true;
CREATE INDEX IF NOT EXISTS idx_opps_veteran_relevance ON opportunities (veteran_relevance_flag) WHERE veteran_relevance_flag = true;
CREATE INDEX IF NOT EXISTS idx_opps_sb_relevance ON opportunities (small_business_relevance_flag) WHERE small_business_relevance_flag = true;
CREATE INDEX IF NOT EXISTS idx_opps_follow_on ON opportunities (follow_on_flag) WHERE follow_on_flag = true;
CREATE INDEX IF NOT EXISTS idx_opps_related_notice ON opportunities (related_notice_id) WHERE related_notice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opps_retention ON opportunities (retention_protected) WHERE retention_protected = true;
CREATE INDEX IF NOT EXISTS idx_opps_estimated_value ON opportunities (estimated_value) WHERE estimated_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opps_last_crawled ON opportunities (last_crawled_at);
