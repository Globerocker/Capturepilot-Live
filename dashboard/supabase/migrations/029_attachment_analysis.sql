-- Migration 029: Attachment analysis jobs + opportunity cache column
CREATE TABLE IF NOT EXISTS attachment_analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id TEXT NOT NULL,
    user_profile_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | downloading | extracting | completed | failed
    files_total INTEGER,
    files_done INTEGER DEFAULT 0,
    current_file TEXT,
    extracted_requirements JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attachment_jobs_notice ON attachment_analysis_jobs(notice_id);
CREATE INDEX IF NOT EXISTS idx_attachment_jobs_profile ON attachment_analysis_jobs(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_attachment_jobs_status ON attachment_analysis_jobs(status);

ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS attachments_cached_until TIMESTAMPTZ;
