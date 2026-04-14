-- Scheduled emails — drip sequencing and delayed sends.
-- The process_scheduled_emails cron picks up rows where scheduled_for <= NOW() AND sent_at IS NULL.

CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    email_address TEXT NOT NULL,
    contact_name TEXT,
    template_key TEXT NOT NULL,
    sequence_key TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due
    ON scheduled_emails (scheduled_for)
    WHERE sent_at IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user
    ON scheduled_emails (user_profile_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_sequence
    ON scheduled_emails (sequence_key, user_profile_id);

-- RLS: admins can read, service role bypasses
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scheduled_emails"
    ON scheduled_emails FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );
