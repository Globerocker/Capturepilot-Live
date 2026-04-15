-- ============================================================
-- Migration 023: Business profile fields the crawler can't know
-- ============================================================
-- These are collected in onboarding Step 3 (after the Quick
-- Checker/SAM crawl has prefilled Step 2). They're also synced
-- to HubSpot so Sales/Success can segment by firmographics.
-- ============================================================

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN company_size TEXT
        CHECK (company_size IN ('micro', 'small', 'mid', 'large'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- employee_count already exists (INTEGER) in earlier schema — leave alone.

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN annual_revenue_range TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- years_in_business already exists (INTEGER) in earlier schema — leave alone.

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN has_federal_experience BOOLEAN;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN federal_experience_notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN user_profiles.company_size IS
    'Buckets: micro (1-9), small (10-49), mid (50-249), large (250+). Set in onboarding Step 3.';
COMMENT ON COLUMN user_profiles.annual_revenue_range IS
    'One of: <1M, 1-5M, 5-25M, 25-100M, 100M+. Stored as label, not a numeric midpoint.';
COMMENT ON COLUMN user_profiles.has_federal_experience IS
    'Has the company ever held a prime federal contract? Distinct from federal_awards_count (which is a numeric tally).';
COMMENT ON COLUMN user_profiles.federal_experience_notes IS
    'Free-text context on federal experience (e.g. agencies, contract vehicles, notable awards).';
