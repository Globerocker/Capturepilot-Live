-- ============================================================
-- Migration 022: Add job_title column to user_profiles
-- ============================================================
-- Captures the primary contact's position/title in the company.
-- Required during onboarding alongside contact_name + contact_phone.
-- Also synced to HubSpot as the `jobtitle` contact property.
-- ============================================================

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN job_title TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN user_profiles.job_title IS
    'Position/title of the primary contact person (e.g. CEO, Owner, Director). Collected during onboarding.';
