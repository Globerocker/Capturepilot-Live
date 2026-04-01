-- 011: Consulting Client Portal (idempotent — safe to re-run)

-- ============================================================
-- 1. User Role & Account Type columns
-- ============================================================
DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN account_type TEXT DEFAULT 'self_service';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN managed_by UUID;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN client_since TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN client_status TEXT DEFAULT 'active';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN google_linked BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN secondary_email TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN contact_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN contact_phone TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_profiles ADD COLUMN notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 2. Client Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS client_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    assigned_by UUID,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    category TEXT,
    opportunity_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON client_tasks(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON client_tasks(status);

-- ============================================================
-- 3. Client Documents
-- ============================================================
CREATE TABLE IF NOT EXISTS client_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    uploaded_by UUID,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    category TEXT DEFAULT 'general',
    description TEXT,
    is_template BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_user ON client_documents(user_profile_id);

-- ============================================================
-- 4. Competitor Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS client_competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    competitor_name TEXT NOT NULL,
    website TEXT,
    uei TEXT,
    cage_code TEXT,
    naics_codes TEXT[],
    employee_count TEXT,
    revenue_estimate TEXT,
    description TEXT,
    overlap_score INTEGER DEFAULT 0,
    federal_presence TEXT,
    crawl_data JSONB,
    last_analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitors_user ON client_competitors(user_profile_id);

-- ============================================================
-- 5. Activity Log
-- ============================================================
CREATE TABLE IF NOT EXISTS client_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    actor_id UUID,
    action TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON client_activity_log(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON client_activity_log(created_at);

-- ============================================================
-- 6. Email tracking on notifications
-- ============================================================
DO $$ BEGIN
    ALTER TABLE user_notifications ADD COLUMN email_sent BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_notifications ADD COLUMN email_sent_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 7. RLS — drop all first, then recreate
-- ============================================================
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_own ON client_tasks;
DROP POLICY IF EXISTS tasks_admin ON client_tasks;
DROP POLICY IF EXISTS docs_own ON client_documents;
DROP POLICY IF EXISTS docs_admin ON client_documents;
DROP POLICY IF EXISTS competitors_own ON client_competitors;
DROP POLICY IF EXISTS competitors_admin ON client_competitors;
DROP POLICY IF EXISTS activity_own ON client_activity_log;
DROP POLICY IF EXISTS activity_admin ON client_activity_log;

CREATE POLICY tasks_own ON client_tasks FOR SELECT
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY tasks_admin ON client_tasks FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY docs_own ON client_documents FOR SELECT
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY docs_admin ON client_documents FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY competitors_own ON client_competitors FOR SELECT
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY competitors_admin ON client_competitors FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY activity_own ON client_activity_log FOR SELECT
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY activity_admin ON client_activity_log FOR ALL
    USING (true) WITH CHECK (true);
