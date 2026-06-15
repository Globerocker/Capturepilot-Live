-- Migration 164 — track website-email scrape attempts on contractors.
--
-- SAM redacts POC emails and Apollo barely covers micro federal contractors
-- (~0.4% yield), so the practical email source is the contractor's own website.
-- This flag lets the scraper (/api/cron/scrape_contractor_emails) attempt each
-- contractor once without re-fetching sites it already tried.

ALTER TABLE public.contractors
    ADD COLUMN IF NOT EXISTS email_scrape_done boolean NOT NULL DEFAULT false;

-- Partial index: the scraper's working set is "no email yet, not yet tried".
CREATE INDEX IF NOT EXISTS idx_contractors_email_scrape
    ON public.contractors (email_scrape_done)
    WHERE email IS NULL;
