-- Migration 169 — reconcile outreach_campaign_contacts with the cadence engine.
--
-- run_outreach_cadence tracks per-contact retry state via consecutive_failures
-- and stamps started_at on first send, but the live table never had those
-- columns (schema drift between migrations 148/156). Without them the cadence
-- SELECT errors and no campaign ever advances. Add them (additive, safe).

ALTER TABLE public.outreach_campaign_contacts
    ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS started_at timestamptz;

NOTIFY pgrst, 'reload schema';
