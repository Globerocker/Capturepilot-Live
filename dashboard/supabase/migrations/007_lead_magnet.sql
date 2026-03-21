-- Sprint 21: Lead Magnet Onboarding Crawler
-- New table for anonymous company analyses (pre-signup lead magnet)

CREATE TABLE IF NOT EXISTS company_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input fields
  company_name TEXT NOT NULL,
  website TEXT NOT NULL,
  uei TEXT,

  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'crawling', 'classifying', 'scoring', 'complete', 'failed')),

  -- Crawl results (structured JSON)
  crawl_data JSONB DEFAULT '{}',

  -- SAM.gov enrichment data
  sam_data JSONB DEFAULT '{}',

  -- NAICS classification results
  inferred_naics JSONB DEFAULT '[]',

  -- LLM-generated company summary
  company_summary TEXT,

  -- Preview match results (top 10)
  preview_matches JSONB DEFAULT '[]',

  -- Inferred profile for onboarding pre-fill
  inferred_profile JSONB DEFAULT '{}',

  -- Conversion tracking
  converted_user_id UUID,
  converted_at TIMESTAMPTZ,

  -- Analytics
  ip_address INET,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_analyses_status ON company_analyses(status);
CREATE INDEX IF NOT EXISTS idx_company_analyses_website ON company_analyses(website);
CREATE INDEX IF NOT EXISTS idx_company_analyses_created ON company_analyses(created_at DESC);

-- RLS
ALTER TABLE company_analyses ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (lead magnet entry point)
CREATE POLICY "Allow anonymous insert on company_analyses"
  ON company_analyses FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only service role can read/update (API routes use service key)
-- No SELECT/UPDATE policies for anon/authenticated

-- Add fields to user_profiles for lead magnet integration
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS company_description TEXT,
  ADD COLUMN IF NOT EXISTS analysis_id UUID,
  ADD COLUMN IF NOT EXISTS onboarding_source TEXT DEFAULT 'manual';
