-- ==========================================
-- Phase 20: Contractor Discovery & Enrichment Engine
-- ==========================================
-- Adds tables and columns for automated contractor discovery,
-- contact enrichment (Apollo, website scraping, Google Business),
-- and opportunity attachment intelligence.

-- 1. ENRICHMENT JOBS TABLE
-- Tracks each enrichment run per opportunity (auto or manual trigger)
-- ==========================================
CREATE TABLE IF NOT EXISTS enrichment_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('auto', 'manual')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    contractors_found INTEGER DEFAULT 0,
    contractors_enriched INTEGER DEFAULT 0,
    error_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_opportunity ON enrichment_jobs(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs(status);

-- 2. OPPORTUNITY-CONTRACTOR LINK TABLE
-- Maps discovered contractors to the opportunity that triggered discovery.
-- This is the "10-20 contactable contractors per opportunity" table.
-- ==========================================
CREATE TABLE IF NOT EXISTS opportunity_contractors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE NOT NULL,
    contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE NOT NULL,
    enrichment_job_id UUID REFERENCES enrichment_jobs(id) ON DELETE SET NULL,
    discovery_source TEXT NOT NULL CHECK (discovery_source IN ('sam_entity', 'google_local', 'existing_match')),
    enrichment_status TEXT NOT NULL DEFAULT 'discovered' CHECK (enrichment_status IN ('discovered', 'enriching', 'enriched', 'failed')),
    contact_readiness_score INTEGER DEFAULT 0 CHECK (contact_readiness_score >= 0 AND contact_readiness_score <= 100),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(opportunity_id, contractor_id)
);

CREATE INDEX IF NOT EXISTS idx_opp_contractors_opportunity ON opportunity_contractors(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_contractors_status ON opportunity_contractors(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_opp_contractors_readiness ON opportunity_contractors(contact_readiness_score DESC);

-- 3. CONTRACTOR CONTACTS TABLE
-- Stores enriched decision-maker contacts (from Apollo, website scraping, Google Business, SAM POC).
-- ==========================================
CREATE TABLE IF NOT EXISTS contractor_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE NOT NULL,
    full_name TEXT,
    title TEXT,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    source TEXT NOT NULL CHECK (source IN ('apollo', 'website_scrape', 'google_business', 'sam_poc', 'manual')),
    confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_contacts_contractor ON contractor_contacts(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_contacts_source ON contractor_contacts(source);

-- 4. OPPORTUNITY ATTACHMENTS TABLE
-- Stores downloaded SOW/RFP documents and extracted requirement keywords.
-- ==========================================
CREATE TABLE IF NOT EXISTS opportunity_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE NOT NULL,
    filename TEXT,
    file_url TEXT,
    file_type TEXT,
    file_size_bytes INTEGER,
    extracted_text TEXT,
    requirements_extracted JSONB DEFAULT '{}'::jsonb,
    downloaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_attachments_opportunity ON opportunity_attachments(opportunity_id);

-- 5. EXPAND CONTRACTORS TABLE
-- Add columns for Google Business data, social links, and enrichment tracking.
-- ==========================================
ALTER TABLE IF EXISTS contractors
    ADD COLUMN IF NOT EXISTS google_rating NUMERIC,
    ADD COLUMN IF NOT EXISTS google_reviews_count INTEGER,
    ADD COLUMN IF NOT EXISTS google_place_id TEXT,
    ADD COLUMN IF NOT EXISTS social_facebook TEXT,
    ADD COLUMN IF NOT EXISTS social_linkedin TEXT,
    ADD COLUMN IF NOT EXISTS social_twitter TEXT,
    ADD COLUMN IF NOT EXISTS enrichment_source TEXT,
    ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS apollo_enriched BOOLEAN DEFAULT FALSE;

-- 6. EXPAND OPPORTUNITIES TABLE
-- Add enrichment status tracking.
-- ==========================================
ALTER TABLE IF EXISTS opportunities
    ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS enrichment_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attachment_urls JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS requirements_extracted JSONB DEFAULT '{}'::jsonb;

-- 7. ENABLE RLS POLICIES (read-only for anon, full for service key)
-- ==========================================
ALTER TABLE enrichment_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read enrichment_jobs" ON enrichment_jobs FOR SELECT USING (true);
CREATE POLICY "Allow service write enrichment_jobs" ON enrichment_jobs FOR ALL USING (true);

ALTER TABLE opportunity_contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read opportunity_contractors" ON opportunity_contractors FOR SELECT USING (true);
CREATE POLICY "Allow service write opportunity_contractors" ON opportunity_contractors FOR ALL USING (true);

ALTER TABLE contractor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read contractor_contacts" ON contractor_contacts FOR SELECT USING (true);
CREATE POLICY "Allow service write contractor_contacts" ON contractor_contacts FOR ALL USING (true);

ALTER TABLE opportunity_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read opportunity_attachments" ON opportunity_attachments FOR SELECT USING (true);
CREATE POLICY "Allow service write opportunity_attachments" ON opportunity_attachments FOR ALL USING (true);
