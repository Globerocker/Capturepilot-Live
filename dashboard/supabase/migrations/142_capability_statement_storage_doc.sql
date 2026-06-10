-- ============================================================
-- Capability statement storage — path-convention docs + backfill
-- Migration 142 (2026-06-10 / Round 2 X3)
--
-- Migration 135 made the `client-docs` bucket private + added per-user
-- RLS keyed on `(storage.foldername(name))[2]` = user_profiles.id. The
-- capability-statements/ prefix is the convention used by:
--   - /api/analyze-company/upload-cap-statement (Quick Checker path,
--     uses `quick-check` as the second segment instead of a profile id —
--     these rows are admin-only by RLS because they don't match any
--     user_profiles.id)
--   - the (former) dashboard capability-statement page — convention
--     `capability-statements/{profile_id}/{timestamp}_{name}` so the
--     storage policy from migration 135 grants the owning user access.
--
-- This migration:
--   1. Documents the convention as table/column comments on storage.objects.
--   2. Backfills any legacy `user_profiles.capability_statement_file_url`
--      that points at a public `client-docs` CDN URL — strips the path
--      and writes it into `user_profiles.notes.capability_statement_path`
--      (so a future signed-URL minting helper can rebuild the URL),
--      then nulls the legacy column.
--   3. Adds a comment on the legacy column so callers know it's deprecated.
-- ============================================================

-- --- (1) Document the path convention ------------------------------------

COMMENT ON POLICY "users can read own docs" ON storage.objects IS
    'Allows authenticated users to SELECT objects in client-docs where the '
    'second folder segment equals their user_profiles.id. Path conventions:'
    '  user-documents/<profile_id>/<file>'
    '  documents/<profile_id>/<file>'
    '  capability-statements/<profile_id>/<file>'
    '  messages/<profile_id>/<file>'
    'Quick Checker uploads use capability-statements/quick-check/<analysis_id>/<file>; '
    'they are intentionally NOT readable by self-service users (admin-only via service role).';

COMMENT ON POLICY "users can write own docs" ON storage.objects IS
    'Mirror of "users can read own docs" — INSERT only into folders the '
    'caller owns (segment[2] = user_profiles.id). See policy comment '
    'above for the four supported prefixes.';

COMMENT ON POLICY "users can delete own docs" ON storage.objects IS
    'Mirror of "users can read own docs" for DELETE. Users may only '
    'remove objects they own (segment[2] = user_profiles.id).';

COMMENT ON POLICY "admins can read all docs" ON storage.objects IS
    'Admins (account_type=admin) bypass the per-profile-id segment check '
    'and can SELECT every object in client-docs. Quick Checker uploads '
    '(capability-statements/quick-check/...) fall into this bucket.';

-- --- (2) Backfill legacy public CDN URLs ---------------------------------

-- Any `user_profiles.capability_statement_file_url` that still contains
-- a public client-docs CDN URL is a stale link from before migration 135
-- flipped the bucket private. The URL is dead (the bucket is private),
-- so we extract the path component and stash it under
-- `notes.capability_statement_path` for future re-signing, then null the
-- legacy column so the trial-prompt-state + AutoSyncedDocs truthy checks
-- stop counting dead links.
DO $$
DECLARE
    storage_root TEXT;
    legacy_re TEXT;
BEGIN
    storage_root := COALESCE(current_setting('app.settings.supabase_url', true), '');
    -- Match either signed or public client-docs URLs from any Supabase host.
    legacy_re := '/storage/v1/object/(?:public|sign)/client-docs/([^?#]+)';

    UPDATE user_profiles up
    SET
        notes = COALESCE(up.notes, '{}'::jsonb)
            || jsonb_build_object(
                'capability_statement_path',
                substring(up.capability_statement_file_url FROM legacy_re),
                'capability_statement_url_migrated_at',
                to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            ),
        capability_statement_file_url = NULL
    WHERE up.capability_statement_file_url IS NOT NULL
      AND up.capability_statement_file_url ~ legacy_re;
END $$;

-- --- (3) Mark the legacy column deprecated -------------------------------

COMMENT ON COLUMN user_profiles.capability_statement_file_url IS
    'DEPRECATED 2026-06-10 (R2-X3). Public/long-lived signed URLs are '
    'no longer persisted — client-docs is private (migration 135). '
    'New uploads store the path under inferred_profile.cap_statement_storage_path '
    '(quick-check flow) or notes.capability_statement_path (dashboard flow). '
    'Mint signed URLs on demand via /api/documents/signed-url.';

COMMENT ON COLUMN user_profiles.capability_statement_file_name IS
    'Display name of the most recently uploaded capability statement file '
    '(e.g. "ACME-CapStatement.pdf"). Paired with notes.capability_statement_path; '
    'kept for UI labels even when the storage path rotates.';
