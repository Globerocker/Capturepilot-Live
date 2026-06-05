-- Migration 117: Add LinkedIn profile columns to user_profiles and marketing_leads
--
-- Adds a consistent set of LinkedIn-sourced identity fields to both the
-- authenticated user table (user_profiles) and the top-of-funnel lead table
-- (marketing_leads). Sourced from LinkedIn OAuth/OIDC, Apollo enrichment, or
-- manual entry. `linkedin_verified` distinguishes OAuth-sourced data from
-- third-party enrichment.

-- ============================================================================
-- user_profiles
-- ============================================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS linkedin_url            TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_handle         TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_headline       TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_picture_url    TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_verified       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_locale         TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_synced_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.linkedin_url            IS 'Full https://www.linkedin.com/in/<handle> URL';
COMMENT ON COLUMN public.user_profiles.linkedin_handle         IS 'LinkedIn vanity slug (e.g. andre-schuler-1234)';
COMMENT ON COLUMN public.user_profiles.linkedin_headline       IS 'LinkedIn profile headline';
COMMENT ON COLUMN public.user_profiles.linkedin_picture_url    IS 'Profile photo URL from LinkedIn';
COMMENT ON COLUMN public.user_profiles.linkedin_verified       IS 'TRUE when data was sourced via LinkedIn OAuth (not Apollo/manual)';
COMMENT ON COLUMN public.user_profiles.linkedin_email_verified IS 'LinkedIn OIDC email_verified claim';
COMMENT ON COLUMN public.user_profiles.linkedin_locale         IS 'LinkedIn locale code (e.g. en_US)';
COMMENT ON COLUMN public.user_profiles.linkedin_synced_at      IS 'Timestamp of most recent LinkedIn data sync';

-- ============================================================================
-- marketing_leads
-- ============================================================================
ALTER TABLE public.marketing_leads
  ADD COLUMN IF NOT EXISTS linkedin_url            TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_handle         TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_headline       TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_picture_url    TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_verified       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_locale         TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_synced_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.marketing_leads.linkedin_url            IS 'Full https://www.linkedin.com/in/<handle> URL';
COMMENT ON COLUMN public.marketing_leads.linkedin_handle         IS 'LinkedIn vanity slug (e.g. andre-schuler-1234)';
COMMENT ON COLUMN public.marketing_leads.linkedin_headline       IS 'LinkedIn profile headline';
COMMENT ON COLUMN public.marketing_leads.linkedin_picture_url    IS 'Profile photo URL from LinkedIn';
COMMENT ON COLUMN public.marketing_leads.linkedin_verified       IS 'TRUE when data was sourced via LinkedIn OAuth (not Apollo/manual)';
COMMENT ON COLUMN public.marketing_leads.linkedin_email_verified IS 'LinkedIn OIDC email_verified claim';
COMMENT ON COLUMN public.marketing_leads.linkedin_locale         IS 'LinkedIn locale code (e.g. en_US)';
COMMENT ON COLUMN public.marketing_leads.linkedin_synced_at      IS 'Timestamp of most recent LinkedIn data sync';

-- ============================================================================
-- Lookup indexes (partial — only rows where the field is populated)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_linkedin_handle
  ON public.user_profiles (linkedin_handle)
  WHERE linkedin_handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_leads_linkedin_handle
  ON public.marketing_leads (linkedin_handle)
  WHERE linkedin_handle IS NOT NULL;
