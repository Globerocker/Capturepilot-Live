-- 014: Fix RLS for portal — allow clients to insert/update/delete own data

-- Documents: clients need INSERT + UPDATE + DELETE on their own docs
DROP POLICY IF EXISTS docs_insert_own ON client_documents;
DROP POLICY IF EXISTS docs_update_own ON client_documents;
DROP POLICY IF EXISTS docs_delete_own ON client_documents;

CREATE POLICY docs_insert_own ON client_documents FOR INSERT
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY docs_update_own ON client_documents FOR UPDATE
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY docs_delete_own ON client_documents FOR DELETE
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- Tasks: clients need UPDATE to mark complete/incomplete
DROP POLICY IF EXISTS tasks_update_own ON client_tasks;
CREATE POLICY tasks_update_own ON client_tasks FOR UPDATE
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- Matches: clients need UPDATE to save/unsave
DROP POLICY IF EXISTS matches_update_own ON user_matches;
CREATE POLICY matches_update_own ON user_matches FOR UPDATE
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- Pursuits: clients need INSERT + UPDATE for pipeline management
DROP POLICY IF EXISTS pursuits_insert_own ON user_pursuits;
DROP POLICY IF EXISTS pursuits_update_own ON user_pursuits;
CREATE POLICY pursuits_insert_own ON user_pursuits FOR INSERT
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY pursuits_update_own ON user_pursuits FOR UPDATE
    USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- Add review_status column to client_documents
DO $$ BEGIN
    ALTER TABLE client_documents ADD COLUMN review_status TEXT DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Competitors: clients need INSERT for adding competitors from portal
DROP POLICY IF EXISTS competitors_insert_own ON client_competitors;
CREATE POLICY competitors_insert_own ON client_competitors FOR INSERT
    WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));
