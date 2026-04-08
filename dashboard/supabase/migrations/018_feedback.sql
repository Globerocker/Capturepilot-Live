-- Beta feedback survey table
CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID REFERENCES user_profiles(id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    likes TEXT,
    improvements TEXT,
    would_recommend BOOLEAN,
    page_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_feedback" ON user_feedback
    FOR INSERT TO authenticated
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "service_role_all_feedback" ON user_feedback
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
