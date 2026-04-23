-- ============================================================
-- Migration 054 — Fix RLS policy coverage gaps
-- ============================================================
-- Context: the event-trigger rls_auto_enable() enables RLS on every new table,
-- but several tables never had policies added, so they became effectively
-- inaccessible to every role except service_role. Discovered via pg_dump on
-- 2026-04-22: these tables have ENABLE ROW LEVEL SECURITY but 0 policies.
--
-- Affected tables:
--   contacts            (91K SAM POC contact rows — public federal data)
--   agencies            (reference lookup)
--   archive_types       (reference lookup)
--   opportunity_types   (reference lookup)
--   capture_outcomes    (per-user outcome logs — owner-scoped)
--
-- The app works today only because every server-side query uses the service
-- role key (which bypasses RLS). Adding these policies is additive and safe.
-- ============================================================

-- ------------------------------------------------------------
-- Reference data — readable by any authenticated user.
-- (These are federal public-record lookups, not user-private.)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'contacts_read_auth') THEN
        CREATE POLICY contacts_read_auth ON public.contacts
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agencies' AND policyname = 'agencies_read_auth') THEN
        CREATE POLICY agencies_read_auth ON public.agencies
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'archive_types' AND policyname = 'archive_types_read_auth') THEN
        CREATE POLICY archive_types_read_auth ON public.archive_types
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'opportunity_types' AND policyname = 'opportunity_types_read_auth') THEN
        CREATE POLICY opportunity_types_read_auth ON public.opportunity_types
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- ------------------------------------------------------------
-- capture_outcomes — admin-only.
-- Not user-scoped (keyed on opportunity_id + contractor_id). Used by the
-- internal capture pipeline to track bid/win/loss outcomes per contractor.
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'capture_outcomes' AND policyname = 'capture_outcomes_admin') THEN
        CREATE POLICY capture_outcomes_admin ON public.capture_outcomes
            FOR ALL TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE user_profiles.id = auth.uid()
                    AND user_profiles.account_type = 'admin'
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE user_profiles.id = auth.uid()
                    AND user_profiles.account_type = 'admin'
                )
            );
    END IF;
END $$;

-- Service role bypasses RLS on all of the above automatically; no explicit
-- service_role policy is required.
