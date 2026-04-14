-- ============================================
-- Pipeline Activity Log
-- Tracks stage changes, note edits, action completions, priority changes,
-- and pursuit creation so the deal detail page can render a history timeline.
-- ============================================

CREATE TABLE IF NOT EXISTS pipeline_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pursuit_id UUID NOT NULL REFERENCES user_pursuits(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL
        CHECK (activity_type IN (
            'stage_changed',
            'note_added',
            'note_updated',
            'action_completed',
            'priority_changed',
            'created'
        )),
    from_value TEXT,
    to_value TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_activity_pursuit
    ON pipeline_activity(pursuit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_activity_profile
    ON pipeline_activity(user_profile_id, created_at DESC);

-- RLS: users can only see / write activity for their own pursuits.
ALTER TABLE pipeline_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own pipeline activity" ON pipeline_activity;
CREATE POLICY "Users can manage own pipeline activity"
    ON pipeline_activity FOR ALL
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
