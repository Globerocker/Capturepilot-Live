-- 026: Proposal generation jobs (background AI proposal drafting)
-- Tracks long-running AI proposal generation jobs so progress survives
-- page navigation, browser refresh, and serverless restarts.

CREATE TABLE IF NOT EXISTS proposal_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    notice_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
        -- pending | writing | completed | failed
    sections_requested TEXT[],
    sections_completed JSONB DEFAULT '[]'::jsonb,
        -- array of { title, content, word_count, compliance_notes, completed_at }
    sections_errored JSONB DEFAULT '[]'::jsonb,
        -- array of { section, error }
    current_section TEXT,
    total_sections INTEGER,
    completed_sections INTEGER DEFAULT 0,
    result JSONB,
        -- final proposal payload: { proposal_title, agency, sections, compliance_matrix,
        -- total_word_count, estimated_pages }
    error TEXT,
    tone TEXT DEFAULT 'formal',
    max_pages INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_proposal_jobs_user ON proposal_jobs(user_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_jobs_active ON proposal_jobs(user_profile_id, created_at DESC)
    WHERE status IN ('pending', 'writing');

ALTER TABLE proposal_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_jobs_own ON proposal_jobs;
CREATE POLICY proposal_jobs_own ON proposal_jobs FOR ALL
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()))
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS proposal_jobs_service ON proposal_jobs;
CREATE POLICY proposal_jobs_service ON proposal_jobs FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION touch_proposal_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_jobs_updated_at ON proposal_jobs;
CREATE TRIGGER trg_proposal_jobs_updated_at
    BEFORE UPDATE ON proposal_jobs
    FOR EACH ROW
    EXECUTE FUNCTION touch_proposal_jobs_updated_at();
