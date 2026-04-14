-- Migration 028: Cancellation feedback (retention flow)
CREATE TABLE IF NOT EXISTS cancellation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL,
    stripe_subscription_id TEXT,
    reason TEXT NOT NULL,
    free_text TEXT,
    accepted_retention_offer BOOLEAN DEFAULT FALSE,
    cancelled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_profile ON cancellation_feedback(user_profile_id);
