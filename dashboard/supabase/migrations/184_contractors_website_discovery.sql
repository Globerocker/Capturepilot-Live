-- 184_contractors_website_discovery.sql
--
-- Website-discovery enrichment lane (GET /api/cron/discover_contractor_websites).
--
-- ~50% of the 84K contractors are un-enriched purely because they have NO
-- website to crawl (website IS NULL AND business_url IS NULL). SAM redacts
-- their POC emails too, so email-derivation barely helps. The discovery lane
-- Brave-searches each company by name+state, picks the OFFICIAL company website
-- (rejecting directories/socials/gov/aggregators, validating name/host token
-- overlap), and — when it finds one — writes contractors.website and resets
-- the QC claim state so the existing enrich_contractors_quickcheck lane picks
-- the row up and runs the full crawl+LLM extraction.
--
-- website_discovery_attempted_at stamps EVERY row the lane processes (found or
-- not) so we don't re-Brave-search the same no-site row forever. The lane skips
-- rows already stamped within a cooldown window.

alter table public.contractors
    add column if not exists website_discovery_attempted_at timestamptz;

-- Partial index over the candidate set: not-yet-enriched, no website, never
-- (or long-ago) attempted. Lets the lane pull the next batch cheaply and
-- prioritize by federal_awards_count without a full-table scan.
create index if not exists contractors_website_discovery_idx
    on public.contractors (website_discovery_attempted_at nulls first, federal_awards_count desc nulls last)
    where qc_enriched is not true and website is null and business_url is null;

comment on column public.contractors.website_discovery_attempted_at is
    'Last time discover_contractor_websites Brave-searched for this contractor''s official site (found or not). Throttles re-search of no-website rows.';
