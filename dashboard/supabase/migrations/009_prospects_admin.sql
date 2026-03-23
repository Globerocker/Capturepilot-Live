-- Sprint 24: Prospects admin dashboard, save functionality, status fixes

-- Add is_saved flag for prospect bookmarking
ALTER TABLE company_analyses
  ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT false;

-- Fix status constraint to include all pipeline stages
ALTER TABLE company_analyses DROP CONSTRAINT IF EXISTS company_analyses_status_check;
ALTER TABLE company_analyses
  ADD CONSTRAINT company_analyses_status_check
  CHECK (status IN ('pending', 'crawling', 'enriching', 'classifying', 'scoring', 'generating', 'complete', 'error', 'failed'));

-- Index for saved prospects
CREATE INDEX IF NOT EXISTS idx_company_analyses_saved ON company_analyses(is_saved) WHERE is_saved = true;
