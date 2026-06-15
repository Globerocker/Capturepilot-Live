-- Migration 167 — track full Quick Checker enrichment on contractors.
-- The scraper (164) only grabbed an email. This flag marks contractors run
-- through the full runQuickCheck() pipeline (keywords, certs, capability,
-- naics, gov-experience, strengths/weaknesses) stored in capability_summary_ai.

ALTER TABLE public.contractors
    ADD COLUMN IF NOT EXISTS qc_enriched boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contractors_qc_enriched
    ON public.contractors (qc_enriched)
    WHERE qc_enriched = false;
