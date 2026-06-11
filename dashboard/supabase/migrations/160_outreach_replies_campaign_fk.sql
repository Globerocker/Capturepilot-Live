-- Migration 160 — Denormalized campaign_id on outreach_replies
--
-- The /admin/outreach Inbox UI does:
--   outreach_replies.select('*, outreach_campaigns(*)')
--
-- PostgREST tried to auto-resolve a relationship between outreach_replies
-- and outreach_campaigns and failed with:
--   "Could not find a relationship between 'outreach_replies' and
--    'outreach_campaigns' in the schema cache"
--
-- Reason: the campaign is reached only via 2 hops
--   outreach_replies.campaign_step_run_id
--     → outreach_campaign_step_runs.campaign_contact_id
--       → outreach_campaign_contacts.campaign_id
--
-- Fix: add a denormalized `campaign_id` column on outreach_replies with a
-- direct FK to outreach_campaigns, backfill existing rows by walking the
-- chain, and install a BEFORE INSERT/UPDATE trigger that auto-populates it
-- so app code never has to set it explicitly.

ALTER TABLE outreach_replies
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_replies_campaign_id ON outreach_replies(campaign_id);

-- Backfill existing rows.
UPDATE outreach_replies r
SET campaign_id = cc.campaign_id
FROM outreach_campaign_step_runs sr
JOIN outreach_campaign_contacts cc ON cc.id = sr.campaign_contact_id
WHERE r.campaign_step_run_id = sr.id AND r.campaign_id IS NULL;

-- Trigger to auto-populate campaign_id on insert/update of campaign_step_run_id.
CREATE OR REPLACE FUNCTION outreach_replies_resolve_campaign()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.campaign_step_run_id IS NOT NULL AND NEW.campaign_id IS NULL THEN
        SELECT cc.campaign_id INTO NEW.campaign_id
        FROM outreach_campaign_step_runs sr
        JOIN outreach_campaign_contacts cc ON cc.id = sr.campaign_contact_id
        WHERE sr.id = NEW.campaign_step_run_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_outreach_replies_resolve_campaign ON outreach_replies;
CREATE TRIGGER tg_outreach_replies_resolve_campaign
    BEFORE INSERT OR UPDATE OF campaign_step_run_id ON outreach_replies
    FOR EACH ROW EXECUTE FUNCTION outreach_replies_resolve_campaign();

NOTIFY pgrst, 'reload schema';
