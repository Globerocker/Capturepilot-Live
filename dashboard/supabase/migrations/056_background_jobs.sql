-- ============================================================
-- Migration 056 — generic background_jobs table
-- ============================================================
-- One row per long-running async task (AI win strategy, voice brief,
-- compliance matrix, capability matrix, capture brief, bulk recrawl, etc).
-- The client polls the row every 2s and renders a step-by-step progress UI.
-- Jobs persist across navigation so the user can start a long-running task,
-- tab away, and come back to see progress (or the final result).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.background_jobs (
    id              uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,

    -- Dispatch
    kind            text NOT NULL,                                         -- 'ai_win_strategy' | 'voice_brief' | 'compliance_matrix' | ...
    title           text,                                                  -- human-readable title for the indicator pill
    status          text NOT NULL DEFAULT 'pending',                       -- pending | running | completed | failed | canceled
    opportunity_id  uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
    notice_id       text,

    -- Progress
    steps           jsonb DEFAULT '[]'::jsonb,                             -- [{key,label,status,started_at,duration_ms,detail}]
    current_step    text,
    completed_steps integer DEFAULT 0,
    total_steps     integer DEFAULT 0,
    progress_pct    integer DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),

    -- Output
    result          jsonb,
    error           text,

    -- Timing
    started_at      timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz DEFAULT now() NOT NULL,
    updated_at      timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT bg_jobs_status_check CHECK (
        status IN ('pending','running','completed','failed','canceled')
    )
);

CREATE INDEX IF NOT EXISTS idx_bg_jobs_user_status  ON public.background_jobs (user_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_updated      ON public.background_jobs (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_kind         ON public.background_jobs (kind, status);

-- Touch updated_at on update
CREATE OR REPLACE FUNCTION public.touch_background_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_background_jobs_touch ON public.background_jobs;
CREATE TRIGGER trg_background_jobs_touch
    BEFORE UPDATE ON public.background_jobs
    FOR EACH ROW EXECUTE FUNCTION public.touch_background_jobs_updated_at();

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'background_jobs' AND policyname = 'bg_jobs_owner_select') THEN
        CREATE POLICY bg_jobs_owner_select ON public.background_jobs
            FOR SELECT TO authenticated
            USING (user_profile_id IN (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid()));
    END IF;
END $$;
