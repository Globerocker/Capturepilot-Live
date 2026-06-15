-- ============================================================
-- Migration 168: Outreach step conditions + stop-on-reply
-- ============================================================
-- Conditional logic for outreach sequences. The core case: a step that
-- only fires if the contact hasn't replied yet, plus a campaign-level
-- "stop the whole sequence once they reply" switch.
--
-- Kept deliberately simple and extensible:
--   * outreach_campaign_steps.send_condition — per-step gate. 'always'
--     (default) fires unconditionally; 'if_no_reply' skips the step when
--     the contact has a row in outreach_replies for this campaign. Richer
--     branches (if_no_open, if_clicked, …) can extend the CHECK later.
--   * outreach_campaigns.stop_on_reply — when true (default), the cadence
--     engine completes the contact the moment a reply lands, regardless of
--     per-step conditions.
--
-- The send engine (/api/cron/run_outreach_cadence) reads both columns and
-- consults outreach_replies (campaign_id + contact email/id) before sending.
-- ============================================================

-- Per-step send gate.
ALTER TABLE public.outreach_campaign_steps
    ADD COLUMN IF NOT EXISTS send_condition text NOT NULL DEFAULT 'always';

DO $$ BEGIN
    ALTER TABLE public.outreach_campaign_steps
        ADD CONSTRAINT outreach_campaign_steps_send_condition_check
        CHECK (send_condition IN ('always', 'if_no_reply'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Campaign-level "stop the whole sequence once the contact replies".
ALTER TABLE public.outreach_campaigns
    ADD COLUMN IF NOT EXISTS stop_on_reply boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.outreach_campaign_steps.send_condition IS
    'Per-step send gate. always = fire unconditionally; if_no_reply = skip when the contact has already replied to this campaign.';
COMMENT ON COLUMN public.outreach_campaigns.stop_on_reply IS
    'When true (default), the cadence engine completes a contact as soon as they reply, halting all remaining steps.';

NOTIFY pgrst, 'reload schema';
