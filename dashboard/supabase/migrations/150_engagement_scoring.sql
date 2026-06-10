-- Migration 150 — Engagement scoring + lead-score schema (R3-M1.3)
--
-- This builds the 0-100 engagement score that drives the outreach prioritization
-- queue. The scoring lives in `outreach_contacts.engagement_score` so existing
-- list/segment queries can sort/filter by it cheaply, and a richer per-event log
-- in `outreach_engagement_events` powers the analytics dashboard.
--
-- The composite lead score (fit × intent) lives in `outreach_lead_scores` so we
-- can update it independently when ICP weights change without touching the
-- per-event log.
--
-- Scoring model (one pass over the event history per contact):
--   +5  per email_delivered
--   +10 per opened          (capped at 50 so a 30-open thread doesn't dominate)
--   +15 per clicked
--   +25 per replied (positive sentiment)
--   -10 per replied (negative sentiment)
--   -20 per bounced
--   -100 hard-set when opted_out
--
-- The function clamps the final value to [0,100]. opted_out short-circuits to 0
-- since the contact is unreachable regardless of how warm prior signals were.
--
-- The parent tables (outreach_contacts, outreach_campaigns, outreach_steps) are
-- provisioned by R3-M1.1 / R3-M1.2 streams which may merge after this file. We
-- defensively guard every reference with `IF EXISTS` or DO blocks so this
-- migration is order-independent within the R3 batch.

-- ============================================================================
-- 1. Engagement columns on outreach_contacts (if the table exists yet)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_contacts') THEN
        EXECUTE 'ALTER TABLE public.outreach_contacts
            ADD COLUMN IF NOT EXISTS engagement_score INTEGER NOT NULL DEFAULT 0';
        EXECUTE 'ALTER TABLE public.outreach_contacts
            ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMPTZ';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_outreach_contacts_engagement_score
            ON public.outreach_contacts(engagement_score DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_outreach_contacts_last_engagement
            ON public.outreach_contacts(last_engagement_at DESC)
            WHERE last_engagement_at IS NOT NULL';
    END IF;
END $$;


-- ============================================================================
-- 2. Granular per-event log for analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_engagement_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id    UUID NOT NULL,
    campaign_id   UUID,
    step_id       UUID,
    event_type    TEXT NOT NULL CHECK (event_type IN (
        'email_sent',
        'email_delivered',
        'email_opened',
        'email_clicked',
        'email_replied_positive',
        'email_replied_negative',
        'email_replied_neutral',
        'email_bounced',
        'email_complained',
        'email_unsubscribed',
        'email_opted_out',
        'call_connected',
        'call_voicemail',
        'meeting_booked'
    )),
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wire the FKs only if the parent tables exist now. R3-M1.1/M1.2 may add them
-- later; we'll re-attach in a follow-up migration if needed.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_contacts')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'outreach_engagement_events_contact_id_fkey'
                         AND table_name = 'outreach_engagement_events') THEN
        EXECUTE 'ALTER TABLE public.outreach_engagement_events
            ADD CONSTRAINT outreach_engagement_events_contact_id_fkey
            FOREIGN KEY (contact_id) REFERENCES public.outreach_contacts(id) ON DELETE CASCADE';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_campaigns')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'outreach_engagement_events_campaign_id_fkey'
                         AND table_name = 'outreach_engagement_events') THEN
        EXECUTE 'ALTER TABLE public.outreach_engagement_events
            ADD CONSTRAINT outreach_engagement_events_campaign_id_fkey
            FOREIGN KEY (campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_steps')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'outreach_engagement_events_step_id_fkey'
                         AND table_name = 'outreach_engagement_events') THEN
        EXECUTE 'ALTER TABLE public.outreach_engagement_events
            ADD CONSTRAINT outreach_engagement_events_step_id_fkey
            FOREIGN KEY (step_id) REFERENCES public.outreach_steps(id) ON DELETE SET NULL';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outreach_engagement_events_contact_time
    ON public.outreach_engagement_events(contact_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_engagement_events_campaign_type_time
    ON public.outreach_engagement_events(campaign_id, event_type, captured_at);
CREATE INDEX IF NOT EXISTS idx_outreach_engagement_events_recent
    ON public.outreach_engagement_events(captured_at DESC);

ALTER TABLE public.outreach_engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_engagement_events admin all"
    ON public.outreach_engagement_events;
CREATE POLICY "outreach_engagement_events admin all"
    ON public.outreach_engagement_events
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE auth_user_id = auth.uid() AND account_type = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE auth_user_id = auth.uid() AND account_type = 'admin'
        )
    );

COMMENT ON TABLE public.outreach_engagement_events IS
    'Per-event engagement log for outreach analytics. Driven by Resend webhooks (delivered/opened/clicked/bounced) + reply classifier + manual call/meeting events. Reads inform recompute_contact_engagement_score().';


-- ============================================================================
-- 3. Composite lead scores (fit × intent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_lead_scores (
    contact_id    UUID PRIMARY KEY,
    score         INTEGER NOT NULL DEFAULT 0,
    fit_score     INTEGER NOT NULL DEFAULT 0,
    intent_score  INTEGER NOT NULL DEFAULT 0,
    composite     NUMERIC GENERATED ALWAYS AS ((fit_score + intent_score) / 2.0) STORED,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_contacts')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'outreach_lead_scores_contact_id_fkey'
                         AND table_name = 'outreach_lead_scores') THEN
        EXECUTE 'ALTER TABLE public.outreach_lead_scores
            ADD CONSTRAINT outreach_lead_scores_contact_id_fkey
            FOREIGN KEY (contact_id) REFERENCES public.outreach_contacts(id) ON DELETE CASCADE';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outreach_lead_scores_composite
    ON public.outreach_lead_scores(composite DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_lead_scores_updated
    ON public.outreach_lead_scores(updated_at DESC);

ALTER TABLE public.outreach_lead_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_lead_scores admin all"
    ON public.outreach_lead_scores;
CREATE POLICY "outreach_lead_scores admin all"
    ON public.outreach_lead_scores
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE auth_user_id = auth.uid() AND account_type = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE auth_user_id = auth.uid() AND account_type = 'admin'
        )
    );

COMMENT ON TABLE public.outreach_lead_scores IS
    'Composite (fit × intent) lead score per outreach contact. fit_score = NAICS overlap with our ICP, intent_score = engagement_score. composite is a generated column averaging the two so the prioritization queue sorts on a single index.';


-- ============================================================================
-- 4. recompute_contact_engagement_score(p_contact_id UUID) RETURNS INT
-- ============================================================================
-- Walks the event log for one contact, applies the weights described above,
-- writes back to outreach_contacts.engagement_score + last_engagement_at,
-- and returns the new score. Idempotent — safe to call on every webhook.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recompute_contact_engagement_score(p_contact_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_delivered        INTEGER := 0;
    v_opened           INTEGER := 0;
    v_clicked          INTEGER := 0;
    v_replied_pos      INTEGER := 0;
    v_replied_neg      INTEGER := 0;
    v_bounced          INTEGER := 0;
    v_opted_out        BOOLEAN := FALSE;
    v_last_event_at    TIMESTAMPTZ;
    v_score            INTEGER;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE event_type = 'email_delivered'),
        COUNT(*) FILTER (WHERE event_type = 'email_opened'),
        COUNT(*) FILTER (WHERE event_type = 'email_clicked'),
        COUNT(*) FILTER (WHERE event_type = 'email_replied_positive'),
        COUNT(*) FILTER (WHERE event_type = 'email_replied_negative'),
        COUNT(*) FILTER (WHERE event_type IN ('email_bounced', 'email_complained')),
        BOOL_OR(event_type IN ('email_opted_out', 'email_unsubscribed')),
        MAX(captured_at)
    INTO
        v_delivered, v_opened, v_clicked, v_replied_pos, v_replied_neg,
        v_bounced, v_opted_out, v_last_event_at
    FROM public.outreach_engagement_events
    WHERE contact_id = p_contact_id;

    -- Hard short-circuit: opt-out wipes the score.
    IF v_opted_out THEN
        v_score := 0;
    ELSE
        -- Apply weights. Opens are capped so a long thread of re-opens can't
        -- swamp the fresher click/reply signal.
        v_score :=
              (v_delivered    * 5)
            + LEAST(v_opened * 10, 50)
            + (v_clicked      * 15)
            + (v_replied_pos  * 25)
            - (v_replied_neg  * 10)
            - (v_bounced      * 20);

        -- Clamp to [0, 100].
        v_score := GREATEST(0, LEAST(100, v_score));
    END IF;

    -- Persist if the contact row exists. (Function stays safe to call even
    -- if M1.1/M1.2 haven't merged yet.)
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'outreach_contacts') THEN
        EXECUTE format(
            'UPDATE public.outreach_contacts
                SET engagement_score = $1,
                    last_engagement_at = COALESCE($2, last_engagement_at)
              WHERE id = $3'
        ) USING v_score, v_last_event_at, p_contact_id;
    END IF;

    RETURN v_score;
END
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_contact_engagement_score(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_contact_engagement_score(UUID) TO service_role;

COMMENT ON FUNCTION public.recompute_contact_engagement_score(UUID) IS
    'Recomputes the 0-100 engagement score for one contact from outreach_engagement_events. Writes back to outreach_contacts.engagement_score + last_engagement_at. Returns the new score. Idempotent — safe to call on every webhook.';


-- ============================================================================
-- 5. rebuild_lead_scores() — cron-friendly bulk recompute
-- ============================================================================
-- Walks every outreach contact with engagement events in the last 7 days,
-- recomputes the engagement score, then refreshes the composite lead score
-- (intent = engagement, fit pulled from outreach_lead_scores if already set,
-- otherwise left at 0 for R3-M1.4 to fill in).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_lead_scores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_contact_id  UUID;
    v_intent      INTEGER;
    v_fit         INTEGER;
    v_count       INTEGER := 0;
BEGIN
    FOR v_contact_id IN
        SELECT DISTINCT contact_id
        FROM public.outreach_engagement_events
        WHERE captured_at >= NOW() - INTERVAL '7 days'
    LOOP
        v_intent := public.recompute_contact_engagement_score(v_contact_id);

        -- Preserve any existing fit_score (M1.4 will populate this from
        -- NAICS-overlap analysis). Default to 0 on first insert.
        SELECT COALESCE(fit_score, 0) INTO v_fit
        FROM public.outreach_lead_scores
        WHERE contact_id = v_contact_id;
        v_fit := COALESCE(v_fit, 0);

        INSERT INTO public.outreach_lead_scores (contact_id, score, fit_score, intent_score, updated_at)
        VALUES (v_contact_id, v_intent, v_fit, v_intent, NOW())
        ON CONFLICT (contact_id) DO UPDATE
            SET intent_score = EXCLUDED.intent_score,
                score        = EXCLUDED.intent_score,
                updated_at   = NOW();

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rebuild_lead_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_lead_scores() TO service_role;

COMMENT ON FUNCTION public.rebuild_lead_scores() IS
    'Cron-friendly bulk recompute. Walks every outreach contact with engagement events in the last 7 days, refreshes their engagement score, then upserts the composite lead score. Returns the number of contacts touched.';


NOTIFY pgrst, 'reload schema';
