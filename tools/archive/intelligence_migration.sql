-- ==========================================
-- Phase 16: Intelligence Engine Migration (UPDATED)
-- ==========================================

-- 1. MATCHES TABLE (The Core Intersection)
-- ==========================================
-- Since the table already exists, we use ALTER TABLE to add the new
-- intelligence engine columns safely.

ALTER TABLE IF EXISTS matches 
    ADD COLUMN IF NOT EXISTS pwin_score INTEGER CHECK (pwin_score >= 0 AND pwin_score <= 100),
    ADD COLUMN IF NOT EXISTS naics_match BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS keyword_match_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS set_aside_aligned BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS agency_history_aligned BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Identified' CHECK (status IN ('Identified', 'Qualified', 'Capture', 'Proposed', 'Won', 'Lost', 'Archived'));

-- Index for heavy JOIN queries on the dashboard
CREATE INDEX IF NOT EXISTS idx_matches_opp_id ON matches(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_matches_contractor_id ON matches(contractor_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_score ON matches(pwin_score DESC);

-- 2. ENRICHMENT & OUTREACH TABLE
-- ==========================================
-- Stores AI-generated email drafts and enriched metadata.
-- Only high-PWin matches get enriched to save API costs.

CREATE TABLE IF NOT EXISTS outreach_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    
    -- The targeted individual
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(255),
    
    -- Generation Payload
    subject_line TEXT,
    email_body TEXT,
    
    -- AI Context
    ai_model_used VARCHAR(100),
    tokens_consumed INTEGER DEFAULT 0,
    
    -- Has the user sent/approved it?
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (match_id) -- Typically one active draft per match
);

-- Note: When running this in Supabase SQL editor, ensure it succeeds.
