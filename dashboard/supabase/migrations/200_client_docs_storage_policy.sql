-- ============================================================
-- Make `client-docs` bucket private + per-user storage RLS
-- Platform audit #11 (2026-06-10): three pages used getPublicUrl()
-- which produced forever-valid links. We flip the bucket to
-- private and gate read access through Postgres RLS so app code
-- must mint short-lived signed URLs (see lib/signed-doc-url.ts).
-- ============================================================

-- Bucket is now private. Server / browser callers must use
-- `createSignedUrl(path, ttlSec)` instead of `getPublicUrl(path)`.
UPDATE storage.buckets SET public = false WHERE id = 'client-docs';

-- Allow authenticated users to read objects scoped to their own folder.
-- App convention puts the *user_profiles.id* as the second folder segment
-- under one of several prefixes:
--   user-documents/<profile_id>/...
--   documents/<profile_id>/...
--   capability-statements/<profile_id>/...
--   messages/<profile_id>/...
-- We resolve the caller's profile id from the `user_profiles` table.
DROP POLICY IF EXISTS "users can read own docs" ON storage.objects;
CREATE POLICY "users can read own docs"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'client-docs'
    AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM user_profiles WHERE auth_user_id = auth.uid()
    )
);

-- Allow authenticated users to upload into their own folder.
DROP POLICY IF EXISTS "users can write own docs" ON storage.objects;
CREATE POLICY "users can write own docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'client-docs'
    AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM user_profiles WHERE auth_user_id = auth.uid()
    )
);

-- Allow authenticated users to delete their own folder objects.
DROP POLICY IF EXISTS "users can delete own docs" ON storage.objects;
CREATE POLICY "users can delete own docs"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'client-docs'
    AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM user_profiles WHERE auth_user_id = auth.uid()
    )
);

-- Admins can read/write across every profile's folder. The `account_type`
-- column on `user_profiles` tags admin accounts.
DROP POLICY IF EXISTS "admins can read all docs" ON storage.objects;
CREATE POLICY "admins can read all docs"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'client-docs'
    AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'admin'
    )
);

-- Service role bypasses RLS automatically — no policy needed for
-- server-side enrichment, admin tools, or cron jobs.

-- ============================================================
-- Schema tweaks so app code can persist `storage_path` and stop
-- depending on a public `file_url`.
-- ============================================================

ALTER TABLE client_documents
    ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- file_url was NOT NULL — relax so new rows can store only the path.
DO $$
BEGIN
    BEGIN
        ALTER TABLE client_documents ALTER COLUMN file_url DROP NOT NULL;
    EXCEPTION WHEN others THEN
        -- already nullable
        NULL;
    END;
END$$;
