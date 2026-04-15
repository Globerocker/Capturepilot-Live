-- 022: User Documents — personal document hub
-- Stores past proposals, capability statements, certs, reference letters, and reusable AI templates.
-- Files live in Supabase Storage bucket `client-docs` under prefix `user-documents/{user_profile_id}/`.

CREATE TABLE IF NOT EXISTS user_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other'
        CHECK (category IN ('proposal','capability','cert','reference','template','other')),
    file_url TEXT,              -- public or signed URL; null for AI-generated text templates
    storage_path TEXT,          -- `user-documents/{user_profile_id}/{timestamp}-{name}`
    file_size BIGINT,
    mime_type TEXT,
    content TEXT,               -- for AI-generated templates (no binary file)
    tags TEXT[] DEFAULT '{}',
    linked_pursuit_id UUID REFERENCES user_pursuits(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_documents_user ON user_documents(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_category ON user_documents(category);
CREATE INDEX IF NOT EXISTS idx_user_documents_tags ON user_documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_user_documents_pursuit ON user_documents(linked_pursuit_id);

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_documents_own ON user_documents;
CREATE POLICY user_documents_own ON user_documents FOR ALL
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()))
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
