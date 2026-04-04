-- 015: Saved Searches + Smart Alerts

CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}',
    -- filters: { naics_codes: [], keywords: "", status: "", set_aside: "", state: "", min_value: 0 }
    alert_enabled BOOLEAN DEFAULT true,
    alert_frequency TEXT DEFAULT 'daily',  -- daily, weekly, realtime
    last_alerted_at TIMESTAMPTZ,
    result_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_alert ON saved_searches(alert_enabled) WHERE alert_enabled = true;

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_searches_own ON saved_searches;
CREATE POLICY saved_searches_own ON saved_searches FOR ALL
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()))
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS saved_searches_admin ON saved_searches;
CREATE POLICY saved_searches_admin ON saved_searches FOR ALL
    USING (true) WITH CHECK (true);
