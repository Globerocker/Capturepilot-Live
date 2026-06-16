-- 176_contractors_social_and_cms.sql
--
-- Deterministic social-link + CMS capture during Quick Checker enrichment.
-- contractors already had social_linkedin / company_linkedin / owner_linkedin /
-- social_facebook / social_twitter (mostly empty — the LLM never saw the URLs
-- because markdown strips <a href>). The QC writeback now extracts these from
-- the raw scraped links/html (see lib/quick-checker/website-tech.ts). These new
-- columns cover the remaining platforms + the website CMS/platform.
alter table public.contractors
  add column if not exists social_instagram   text,
  add column if not exists social_youtube     text,
  add column if not exists social_tiktok      text,
  add column if not exists social_other       jsonb,   -- { github, yelp, pinterest, … }
  add column if not exists website_cms         text,    -- WordPress | Wix | Squarespace | …
  add column if not exists social_extracted_at timestamptz;
