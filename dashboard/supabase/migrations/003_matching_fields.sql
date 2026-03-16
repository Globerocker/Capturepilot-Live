-- ============================================
-- Sprint 11: Enhanced Matching Profile Fields
-- ============================================
-- Run this in Supabase SQL Editor

-- New profile fields for better opportunity matching
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS target_psc_codes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_agencies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contract_value_min NUMERIC,
  ADD COLUMN IF NOT EXISTS contract_value_max NUMERIC,
  ADD COLUMN IF NOT EXISTS security_clearances TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prime_or_sub TEXT DEFAULT 'both';

-- Performance indexes for user_matches
CREATE INDEX IF NOT EXISTS idx_user_matches_score ON user_matches(score DESC);
CREATE INDEX IF NOT EXISTS idx_user_matches_saved ON user_matches(is_saved) WHERE is_saved = true;
CREATE INDEX IF NOT EXISTS idx_user_matches_dismissed ON user_matches(is_dismissed) WHERE is_dismissed = false;
