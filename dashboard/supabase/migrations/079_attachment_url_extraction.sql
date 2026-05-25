-- Migration 079 — PDF Phase A: inline attachment-URL extraction.
--
-- SAM.gov rows already track structured attachments in `resource_links` JSONB,
-- but SLED rows (Bonfire / OpenGov / Socrata) have to scrape URLs from the
-- description HTML. This column holds the result of that regex pass so the
-- detail page can render real "Attachments" cards for state/local opps.
--
-- Phase B (per-portal page scraping for portals that don't embed URLs in
-- their RSS descriptions) ships separately — see PDF_DOCUMENT_SCRAPING_PLAN.md.

alter table opportunities
  add column if not exists extracted_attachment_urls text[];
