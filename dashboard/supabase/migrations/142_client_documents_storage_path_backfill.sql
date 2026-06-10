-- ============================================================
-- R2-X3: Backfill `client_documents.storage_path` from legacy `file_url`
--
-- Context: migration 135 flipped the `client-docs` bucket to private and
-- added the `storage_path TEXT` column. New uploads now persist `storage_path`
-- and read access is gated through short-lived signed URLs. Legacy rows
-- inserted before 135 only have `file_url` pointing at the deprecated public
-- CDN endpoint (which now 400s for a private bucket), so the portal and
-- dashboard document lists can no longer open them.
--
-- This migration:
--   1. Reverse-engineers the object path out of the legacy public URL and
--      writes it back to `storage_path` for every row missing one.
--   2. Documents the residual NULL set (rows that never had a parseable
--      public URL — typically free-text references inserted by admins).
--   3. Installs a trigger that requires every NEW insert to have either
--      `storage_path` set, OR `file_url` set for back-compat display.
--      Pure-NULL inserts are rejected.
-- ============================================================

-- 1. Backfill storage_path from the public CDN URL pattern.
--    Public URL shape:
--      https://<project>.supabase.co/storage/v1/object/public/client-docs/<path>
--    We strip everything up to (and including) `/client-docs/` so the
--    remainder is the storage object path.
UPDATE client_documents
SET storage_path = regexp_replace(
    file_url,
    '^https?://[^/]+/storage/v1/object/public/client-docs/',
    ''
)
WHERE storage_path IS NULL
  AND file_url LIKE '%/storage/v1/object/public/client-docs/%';

-- 2. No-op documentation pass.
--    Rows that are STILL NULL here either:
--      - have a file_url pointing at an external host (admin-pasted link), or
--      - have NULL file_url + NULL storage_path (data-entry bug).
--    We leave them as-is so the application can show a "legacy link" badge
--    and fall back to file_url where present. The trigger below stops the
--    bleed for future rows.
UPDATE client_documents
SET storage_path = NULL
WHERE storage_path IS NULL
  AND (file_url IS NULL OR file_url NOT LIKE '%/storage/v1/object/public/client-docs/%');

-- 3. Enforce that new inserts always carry a way to locate the file.
--    `storage_path` is the authoritative pointer for the private bucket.
--    `file_url` is allowed as a fallback for legacy display only.
CREATE OR REPLACE FUNCTION client_documents_require_pointer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.storage_path IS NULL AND NEW.file_url IS NULL THEN
        RAISE EXCEPTION
            'client_documents.storage_path or file_url is required (got NULL/NULL)'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_documents_require_pointer ON client_documents;
CREATE TRIGGER trg_client_documents_require_pointer
BEFORE INSERT OR UPDATE ON client_documents
FOR EACH ROW
EXECUTE FUNCTION client_documents_require_pointer();

COMMENT ON FUNCTION client_documents_require_pointer() IS
    'Rejects client_documents rows that have neither storage_path nor file_url. '
    'storage_path is authoritative for the private client-docs bucket; '
    'file_url is retained for legacy public-CDN rows.';
