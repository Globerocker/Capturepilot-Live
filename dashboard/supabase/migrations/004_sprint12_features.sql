-- ============================================
-- Sprint 12: AI Features, Call Logs & Billing
-- ============================================
-- Run this in Supabase SQL Editor

-- 1. Email Drafts table
CREATE TABLE IF NOT EXISTS email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    contact_name TEXT,
    contact_email TEXT,
    strategy TEXT NOT NULL CHECK (strategy IN ('standard_alert','certification_leverage','early_engagement')),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_profile_id, opportunity_id, strategy)
);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own drafts" ON email_drafts
    FOR ALL USING (user_profile_id IN (
        SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
    ));

-- 2. Call Logs table
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    contact_name TEXT,
    contact_phone TEXT,
    transcription TEXT,
    notes TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own call logs" ON call_logs
    FOR ALL USING (user_profile_id IN (
        SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
    ));

-- 3. Stripe / Subscription fields on user_profiles
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_email_drafts_user ON email_drafts(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_profile_id);
