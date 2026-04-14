-- Email settings — runtime-configurable enabled/audience per email template.
-- Falls back to src/lib/email-settings.ts defaults when no row exists.

CREATE TABLE IF NOT EXISTS email_settings (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    audience TEXT[] NOT NULL DEFAULT '{}',
    category TEXT NOT NULL DEFAULT 'transactional' CHECK (category IN ('transactional', 'marketing')),
    label TEXT,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only admins can read/write
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email_settings"
    ON email_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );

CREATE POLICY "Admins can update email_settings"
    ON email_settings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );

CREATE POLICY "Admins can insert email_settings"
    ON email_settings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );

-- Service role bypasses RLS automatically (server-side send() uses service key)

-- Seed initial settings from config defaults
INSERT INTO email_settings (key, enabled, audience, category, label, description) VALUES
    ('welcome', true, ARRAY['self_service'], 'transactional', 'Welcome (Self-Service)', 'Sent when a new self-service user completes signup.'),
    ('consulting_welcome', true, ARRAY['consulting'], 'transactional', 'Welcome (Consulting)', 'Sent when admin onboards a consulting client with portal login.'),
    ('task_notification', true, ARRAY['consulting'], 'transactional', 'Task Assignment', 'Sent when a task is assigned to a consulting client.'),
    ('opportunity_alert', true, ARRAY['all_users'], 'transactional', 'Opportunity Alert', 'Daily email with top matching opportunities (max 1 per user per 24h).'),
    ('quick_checker', true, ARRAY['lead'], 'marketing', 'Quick Checker Results', 'Sent when a Quick Checker lead provides their email.'),
    ('trial_expiring_3d', true, ARRAY['self_service'], 'transactional', 'Trial Expiring (3 days)', 'Sent 3 days before trial ends.'),
    ('trial_expiring_1d', true, ARRAY['self_service'], 'transactional', 'Trial Expiring (Last day)', 'Final warning on last day of trial.'),
    ('payment_failed', true, ARRAY['self_service'], 'transactional', 'Payment Failed', 'Sent when Stripe payment fails.'),
    ('subscription_canceled', true, ARRAY['self_service'], 'transactional', 'Subscription Canceled', 'Sent when subscription is canceled.'),
    ('beta_deadline_8d', true, ARRAY['self_service'], 'marketing', 'Beta Deadline (8 days)', 'First beta deadline reminder with BETA25 promo.'),
    ('beta_deadline_1d', true, ARRAY['self_service'], 'marketing', 'Beta Deadline (Last day)', 'Final beta deadline reminder.'),
    ('edu_contracting_101', true, ARRAY['consulting'], 'marketing', 'Learning: Federal Contracting 101', 'Intro guide to federal contracting.'),
    ('edu_naics_codes', true, ARRAY['self_service'], 'marketing', 'Learning: NAICS Codes Explained', 'Explainer on NAICS codes and how to pick them.'),
    ('edu_set_asides', true, ARRAY['all_users'], 'marketing', 'Learning: Set-Aside Programs', 'Deep dive into set-aside programs.'),
    ('edu_capability_statement', true, ARRAY['consulting'], 'marketing', 'Learning: Capability Statement Guide', '6 essential sections of a winning capability statement.')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_email_settings_enabled ON email_settings (enabled);
