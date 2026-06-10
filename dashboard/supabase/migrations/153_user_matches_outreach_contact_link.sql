-- Migration 153 — Link user_matches → outreach_contacts (R3-M5.1)
--
-- The engagement-scoring runtime (R3-M5.1) needs a stable join between a
-- scored match and the outreach contact that represents the opportunity's
-- POC. When a `user_match` is created/updated, we check whether any of the
-- opportunity's POC emails resolve to a row in `outreach_contacts`. If yes,
-- we pin the contact id here so the dashboard can:
--
--   1. Show "this POC's engagement score is 87 — they opened your last 3 emails"
--      next to the match score, without an extra round-trip.
--   2. Power the lead-score cron's rebuild pass — when engagement events land
--      we know which user_matches reference each contact.
--
-- The column is nullable because most matches won't have an outreach contact
-- (POCs without an email, or contacts we haven't imported yet). When the
-- outreach contact gets deleted we don't want to lose the match row, so we
-- use ON DELETE SET NULL.
--
-- The companion `created_outreach_contact_id` column on `user_matches` is
-- intentionally NOT added — if you need full history of which contact a match
-- was linked to over time, that lives in `outreach_engagement_events` keyed
-- by (contact_id, captured_at).

DO $$
BEGIN
    -- Defensive: only add the FK if outreach_contacts exists. R3-M1.1 ships
    -- the parent table; this migration may land in any order relative to it.
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_contacts')
       AND EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'user_matches') THEN

        EXECUTE 'ALTER TABLE public.user_matches
            ADD COLUMN IF NOT EXISTS outreach_contact_id UUID
            REFERENCES public.outreach_contacts(id) ON DELETE SET NULL';

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_matches_outreach_contact
            ON public.user_matches(outreach_contact_id)
            WHERE outreach_contact_id IS NOT NULL';

        -- Composite index used by the contact-side query
        -- "which user_matches reference this contact?" — drives the
        -- "high-intent POC just engaged on opportunity X" surfacing flow.
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_matches_contact_user
            ON public.user_matches(outreach_contact_id, user_profile_id)
            WHERE outreach_contact_id IS NOT NULL';
    ELSE
        RAISE NOTICE 'Skipping user_matches.outreach_contact_id — outreach_contacts or user_matches missing. Re-run after R3-M1.1 lands.';
    END IF;
END $$;

COMMENT ON COLUMN public.user_matches.outreach_contact_id IS
    'R3-M5.1: resolved outreach_contacts.id when an opportunity POC email matches an imported contact. Lets the matches UI surface composite_lead_score inline and lets the lead-score recompute cron walk back from a contact event to every affected user_match.';


-- Recompute helper used by /api/cron/recompute_lead_scores so the cron does
-- not have to encode "which contacts moved in the last hour" in TS — keeps
-- the query cost on the DB side where the per-event index lives.
CREATE OR REPLACE FUNCTION public.recently_engaged_contact_ids(p_window_minutes INTEGER DEFAULT 60)
RETURNS TABLE (contact_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT DISTINCT contact_id
    FROM public.outreach_engagement_events
    WHERE captured_at >= NOW() - make_interval(mins => GREATEST(p_window_minutes, 1));
$$;

REVOKE EXECUTE ON FUNCTION public.recently_engaged_contact_ids(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recently_engaged_contact_ids(INTEGER) TO service_role;

COMMENT ON FUNCTION public.recently_engaged_contact_ids(INTEGER) IS
    'Returns contact_ids with at least one engagement event in the last N minutes (default 60). Used by /api/cron/recompute_lead_scores to limit the hourly rebuild to the active subset rather than every row in outreach_contacts.';


NOTIFY pgrst, 'reload schema';
