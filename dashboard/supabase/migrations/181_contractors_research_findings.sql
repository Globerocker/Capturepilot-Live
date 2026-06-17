-- 181_contractors_research_findings.sql
--
-- Backing store for the COMPANY RESEARCH / REVIEW AGENT
-- (POST /api/admin/cockpit/research).
--
-- The agent runs a Brave web search for the contractor's public reputation
-- (Google Business / Yelp / BBB / Clutch / company site / news), crawls the
-- 2-3 most relevant result pages, and runs an OpenAI structured-output pass to
-- distill sentiment + rating + a short human summary of what the firm does and
-- how it's perceived. The full extraction is stashed here as jsonb so the
-- cockpit detail panel can render it without re-running the (slow, paid) pass.
--
-- contractors.google_rating / google_reviews_count already existed but were
-- UNUSED/empty — the agent finally populates them when a numeric rating is
-- found, so the existing review tiles light up.

ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS research_findings jsonb,
    ADD COLUMN IF NOT EXISTS researched_at timestamptz;

COMMENT ON COLUMN contractors.research_findings IS
    'Full output of the cockpit company-research agent: { overall_sentiment, rating, reviews_count, summary, what_they_do, sources[], researched_at }. Populated by POST /api/admin/cockpit/research.';

COMMENT ON COLUMN contractors.researched_at IS
    'Timestamp of the last cockpit company-research agent run for this contractor.';
