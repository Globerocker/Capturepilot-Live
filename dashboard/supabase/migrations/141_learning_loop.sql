-- ============================================
-- AI / ML Learning Loop foundation (W3-4.2)
-- Captures outcomes + edit signals that become training data later:
--   1. pursuit_outcomes      — final disposition of a pursuit (won/lost/no_bid/withdrawn)
--   2. proposal_edit_events  — diff per section between AI output and what the user shipped
--   3. match_engagement_events — every click/dismiss/pursue/save/export on a match card
--
-- All three tables are RLS-scoped to the owning user_profile (via auth_user_id resolve).
-- Service role keeps full access so cron/admin pipelines can read for training.
-- ============================================

-- 1. pursuit_outcomes -------------------------------------------------------
CREATE TABLE IF NOT EXISTS pursuit_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_pursuit_id UUID NOT NULL REFERENCES user_pursuits(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL
        CHECK (outcome IN ('won', 'lost', 'no_bid', 'withdrawn')),
    amount_awarded NUMERIC,
    decision_date DATE,
    lessons_learned TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pursuit_outcomes_pursuit
    ON pursuit_outcomes(user_pursuit_id);
CREATE INDEX IF NOT EXISTS idx_pursuit_outcomes_profile
    ON pursuit_outcomes(user_profile_id, captured_at DESC);

ALTER TABLE pursuit_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pursuit_outcomes_own ON pursuit_outcomes;
CREATE POLICY pursuit_outcomes_own ON pursuit_outcomes FOR ALL
    TO authenticated
    USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS pursuit_outcomes_service ON pursuit_outcomes;
CREATE POLICY pursuit_outcomes_service ON pursuit_outcomes FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- 2. proposal_edit_events ---------------------------------------------------
-- Levenshtein-ish distance via length-diff fallback when extensions not present;
-- we store original + edited, so distance is just a quick scan signal.
CREATE TABLE IF NOT EXISTS proposal_edit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_job_id UUID NOT NULL REFERENCES proposal_jobs(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    original_text TEXT NOT NULL,
    edited_text TEXT NOT NULL,
    edit_distance INTEGER GENERATED ALWAYS AS (
        ABS(LENGTH(COALESCE(edited_text, '')) - LENGTH(COALESCE(original_text, '')))
    ) STORED,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_edit_events_job
    ON proposal_edit_events(proposal_job_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_edit_events_profile
    ON proposal_edit_events(user_profile_id, captured_at DESC);

ALTER TABLE proposal_edit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_edit_events_own ON proposal_edit_events;
CREATE POLICY proposal_edit_events_own ON proposal_edit_events FOR ALL
    TO authenticated
    USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS proposal_edit_events_service ON proposal_edit_events;
CREATE POLICY proposal_edit_events_service ON proposal_edit_events FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- 3. match_engagement_events ------------------------------------------------
CREATE TABLE IF NOT EXISTS match_engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_match_id UUID NOT NULL REFERENCES user_matches(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    event TEXT NOT NULL
        CHECK (event IN ('clicked', 'dismissed', 'pursued', 'saved', 'exported')),
    session_id TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_engagement_match_event
    ON match_engagement_events(user_match_id, event);
CREATE INDEX IF NOT EXISTS idx_match_engagement_profile
    ON match_engagement_events(user_profile_id, captured_at DESC);

ALTER TABLE match_engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_engagement_events_own ON match_engagement_events;
CREATE POLICY match_engagement_events_own ON match_engagement_events FOR ALL
    TO authenticated
    USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS match_engagement_events_service ON match_engagement_events;
CREATE POLICY match_engagement_events_service ON match_engagement_events FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
