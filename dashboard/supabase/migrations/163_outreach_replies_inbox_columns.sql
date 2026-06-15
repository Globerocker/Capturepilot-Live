-- Migration 163 — reconcile outreach_replies with the /admin/outreach Inbox code
--
-- Root cause: migration 159 redefined outreach_replies with a richer column set,
-- but used `create table if not exists`. Migration 149 had already created the
-- table, so 159 was a no-op on the live DB. The Inbox API
-- (src/app/api/admin/outreach/replies/*) plus the classify/reclassify paths
-- select/update columns that were never added, producing:
--   {"error":"column outreach_replies.to_email does not exist"}
-- (and the same latent failure for snippet, sentiment_source, step_id,
--  confidence, meeting_url).
--
-- classify-outreach-reply.ts writes BOTH the legacy names (parsed_meeting_url,
-- classification_confidence) AND the new ones (meeting_url, confidence), so we
-- ADD the new columns rather than rename — keeping both write targets valid.

ALTER TABLE public.outreach_replies
    ADD COLUMN IF NOT EXISTS to_email          text,
    ADD COLUMN IF NOT EXISTS snippet           text,
    ADD COLUMN IF NOT EXISTS sentiment_source  text NOT NULL DEFAULT 'auto',
    ADD COLUMN IF NOT EXISTS step_id           uuid,
    ADD COLUMN IF NOT EXISTS confidence        numeric(4,3),
    ADD COLUMN IF NOT EXISTS meeting_url       text;

-- Constrain sentiment_source to the values the code uses.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'outreach_replies_sentiment_source_chk'
    ) THEN
        ALTER TABLE public.outreach_replies
            ADD CONSTRAINT outreach_replies_sentiment_source_chk
            CHECK (sentiment_source IN ('auto','manual'));
    END IF;
END $$;

-- Backfill existing rows so the Inbox isn't blank: mirror the legacy columns
-- into the new names and pre-render a snippet from the body.
UPDATE public.outreach_replies
SET meeting_url = COALESCE(meeting_url, parsed_meeting_url),
    confidence  = COALESCE(confidence,  classification_confidence),
    snippet     = COALESCE(snippet,     left(body_text, 180))
WHERE meeting_url IS NULL OR confidence IS NULL OR snippet IS NULL;

NOTIFY pgrst, 'reload schema';
