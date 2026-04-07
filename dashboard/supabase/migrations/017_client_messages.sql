CREATE TABLE IF NOT EXISTS client_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'admin')),
    sender_name TEXT,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    opportunity_id UUID REFERENCES opportunities(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_messages_profile ON client_messages(user_profile_id, created_at DESC);

ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_read_own_messages" ON client_messages
    FOR SELECT TO authenticated
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "clients_insert_own_messages" ON client_messages
    FOR INSERT TO authenticated
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()) AND sender_type = 'client');

CREATE POLICY "service_role_all_messages" ON client_messages
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
