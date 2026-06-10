-- Outreach events + KPI rollup.
-- Captures every email/SMS lifecycle event (sent / delivered / opened / clicked / replied / bounced / unsubscribed / complaint).
-- Drives the /admin/outreach Overview dashboard.

CREATE TABLE IF NOT EXISTS outreach_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID,
    user_profile_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    contact_id UUID,
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'voice')),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'sent', 'delivered', 'opened', 'clicked', 'replied',
        'bounced', 'unsubscribed', 'complaint', 'failed'
    )),
    template_key TEXT,
    provider TEXT,                   -- 'resend', 'twilio', 'smtp', ...
    provider_message_id TEXT,
    email_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_events_occurred
    ON outreach_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_events_campaign
    ON outreach_events (campaign_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_events_type
    ON outreach_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_events_provider_msg
    ON outreach_events (provider, provider_message_id);

ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read outreach_events"
    ON outreach_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );

-- Aggregate event counts for a date window.
-- Returns one row with sent/delivered/opened/clicked/replied/bounced/unsubscribed/complaint counts.
CREATE OR REPLACE FUNCTION outreach_kpis(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    sent BIGINT,
    delivered BIGINT,
    opened BIGINT,
    clicked BIGINT,
    replied BIGINT,
    bounced BIGINT,
    unsubscribed BIGINT,
    complaint BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        COUNT(*) FILTER (WHERE event_type = 'sent')         AS sent,
        COUNT(*) FILTER (WHERE event_type = 'delivered')    AS delivered,
        COUNT(*) FILTER (WHERE event_type = 'opened')       AS opened,
        COUNT(*) FILTER (WHERE event_type = 'clicked')      AS clicked,
        COUNT(*) FILTER (WHERE event_type = 'replied')      AS replied,
        COUNT(*) FILTER (WHERE event_type = 'bounced')      AS bounced,
        COUNT(*) FILTER (WHERE event_type = 'unsubscribed') AS unsubscribed,
        COUNT(*) FILTER (WHERE event_type = 'complaint')    AS complaint
    FROM outreach_events
    WHERE occurred_at >= p_from
      AND occurred_at <  p_to;
$$;

-- Per-day rollup for charting. One row per day in range.
CREATE OR REPLACE FUNCTION outreach_kpis_daily(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    day DATE,
    sent BIGINT,
    delivered BIGINT,
    opened BIGINT,
    clicked BIGINT,
    replied BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        date_trunc('day', occurred_at)::date AS day,
        COUNT(*) FILTER (WHERE event_type = 'sent')      AS sent,
        COUNT(*) FILTER (WHERE event_type = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE event_type = 'opened')    AS opened,
        COUNT(*) FILTER (WHERE event_type = 'clicked')   AS clicked,
        COUNT(*) FILTER (WHERE event_type = 'replied')   AS replied
    FROM outreach_events
    WHERE occurred_at >= p_from
      AND occurred_at <  p_to
    GROUP BY 1
    ORDER BY 1;
$$;
