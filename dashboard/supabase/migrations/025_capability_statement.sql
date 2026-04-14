-- Capability statement storage on user_profiles.
-- Stores both the raw rich-text HTML (for editing) and metadata about uploaded files.

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN capability_statement TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN capability_statement_html TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN capability_statement_file_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN capability_statement_file_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN capability_statement_updated_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
