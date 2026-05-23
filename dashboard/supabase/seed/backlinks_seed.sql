-- Seed 25 hand-picked Tier-1/2 backlink prospects so the admin UI has
-- content the moment migration 069 runs. Idempotent (ON CONFLICT DO NOTHING).
-- Run via Supabase SQL editor or `psql ... < seed/backlinks_seed.sql`.

insert into public.backlink_prospects (domain, authority_score, category, tier, status, refdomain_source, pitch_angle, link_target_url, link_anchor_suggestion, notes)
values
  -- ===== Tier 1: niche GovCon editorial =====
  ('federalnewsnetwork.com', 59, 'editorial', 1, 'discovered', 'curated', 'Data story: which agencies have the worst sources-sought-to-award conversion for SMBs', 'https://capturepilot.com/resources/agency-pain-points', 'federal contracting tool', 'High-value journalist target — has covered SMB GovCon for years'),
  ('fedscoop.com', 75, 'editorial', 1, 'discovered', 'curated', 'Op-ed angle: AI in capture intelligence — what works vs vapor', 'https://capturepilot.com', 'capture intelligence platform', 'Strong DA, editor-driven'),
  ('nextgov.com', 75, 'editorial', 1, 'discovered', 'curated', 'Newsletter pitch: weekly digest of new SMB-friendly Sources Sought', 'https://capturepilot.com', 'opportunity discovery tool', 'Editorial calendar friendly to data-driven pitches'),
  ('smallgovcon.com', 55, 'editorial', 1, 'discovered', 'curated', 'Guest post: Set-Aside Compliance Checklist for first-time bidders', 'https://capturepilot.com/resources/agency-pain-points', 'SAM.gov opportunity tracker', 'Steve Koprince — federal contracting attorney. High engagement'),
  ('govology.com', 50, 'editorial', 1, 'discovered', 'curated', 'Webinar/resource listing — co-host with their training team', 'https://capturepilot.com', 'capture management software', 'Joint webinar potential, plus directory listing'),
  ('executivebiz.com', 60, 'editorial', 1, 'discovered', 'curated', 'Founder spotlight: how AI is changing capture for SMBs', 'https://capturepilot.com', 'CapturePilot', 'ExecutiveMosaic family — friendly to vendor profiles'),
  ('govconwire.com', 58, 'editorial', 1, 'discovered', 'curated', 'Press: new product release / funding (if applicable)', 'https://capturepilot.com', 'CapturePilot', 'Same network as executivebiz — submission form available'),
  ('washingtontechnology.com', 65, 'editorial', 1, 'discovered', 'curated', 'Data piece: hidden agency budget unobligated balances by quarter', 'https://capturepilot.com/resources/agency-pain-points', 'federal market intelligence', 'Premium pub — pitch via editor relationships'),
  ('govexec.com', 70, 'editorial', 1, 'discovered', 'curated', 'Opinion: why SMBs lose to incumbents and what to do about it', 'https://capturepilot.com', 'CapturePilot', 'Major outlet — long lead time'),
  ('defenseone.com', 70, 'editorial', 1, 'discovered', 'curated', 'Defense-focused angle: small biz pipeline gaps in DoD', 'https://capturepilot.com', 'opportunity intelligence', 'If you have defense customers, lead with case study'),
  ('meritalk.com', 55, 'editorial', 1, 'discovered', 'curated', 'IT-focused: AI for federal opportunity scoring', 'https://capturepilot.com', 'AI capture platform', 'Strong on AI/IT angles'),
  ('fcw.com', 65, 'editorial', 1, 'discovered', 'curated', 'Analyst piece: market share of capture tools in federal IT', 'https://capturepilot.com', 'CapturePilot', 'Often runs vendor analyst quotes'),

  -- ===== Tier 2: associations & directories =====
  ('apexaccelerators.us', 60, 'association', 2, 'discovered', 'curated', 'Resource partner listing — tool for client APEX centers to refer', 'https://capturepilot.com', 'capture/proposal tool', 'Apply via state APEX directors — relationship play'),
  ('ndia.org', 65, 'association', 2, 'discovered', 'curated', 'Conference sponsor → resource directory listing', 'https://capturepilot.com', 'CapturePilot', 'Defense-industry assoc — pricey but high authority'),
  ('afcea.org', 65, 'association', 2, 'discovered', 'curated', 'Webinar partnership — chapter-level entry point', 'https://capturepilot.com', 'CapturePilot', 'Chapter-by-chapter sales motion'),
  ('ncmahq.org', 60, 'association', 2, 'discovered', 'curated', 'Member-benefit discount → directory listing', 'https://capturepilot.com', 'capture intelligence', 'Contract management focused — natural fit'),
  ('sba.gov', 95, 'association', 2, 'discovered', 'curated', 'Resource Partner / Procurement Technical Assistance Listing', 'https://capturepilot.com', 'small business resource', 'Very long lead — apply via local SBDC'),
  ('govevents.com', 50, 'directory', 2, 'discovered', 'curated', 'Free webinar listing every quarter', 'https://capturepilot.com', 'CapturePilot Webinar', 'Easy win — submit one webinar per quarter'),

  -- ===== Tier 3: SaaS comparison / SMB directories =====
  ('g2.com', 95, 'comparison', 3, 'discovered', 'curated', 'Claim listing + collect 5 reviews from existing users', 'https://capturepilot.com', 'CapturePilot on G2', 'Highest-DA win possible in this tier'),
  ('capterra.com', 90, 'comparison', 3, 'discovered', 'curated', 'Claim listing + add screenshots + paid listing optional', 'https://capturepilot.com', 'CapturePilot on Capterra', 'Gartner network — long-term SEO juice'),
  ('getapp.com', 88, 'comparison', 3, 'discovered', 'curated', 'Same Gartner network as Capterra — single submission', 'https://capturepilot.com', 'CapturePilot on GetApp', 'Auto-syndicates from Capterra mostly'),
  ('producthunt.com', 90, 'comparison', 3, 'discovered', 'curated', 'One-time launch — Friday morning ET for max reach', 'https://capturepilot.com', 'CapturePilot Launch', 'Single shot — line up upvotes beforehand'),
  ('alternativeto.net', 60, 'comparison', 3, 'discovered', 'curated', 'Submit as alternative to GovTribe + HigherGov + GovWin', 'https://capturepilot.com', 'CapturePilot', 'Easy directory submission'),
  ('theresanaiforthat.com', 70, 'comparison', 3, 'discovered', 'curated', 'AI tool directory submission — gov-contracting AI category', 'https://capturepilot.com', 'CapturePilot AI', 'Free submission, decent traffic'),
  ('saashub.com', 50, 'directory', 3, 'discovered', 'curated', 'Submit + add to "Federal Contracting" category', 'https://capturepilot.com', 'CapturePilot', 'Low-effort directory listing')
on conflict (domain) do nothing;

-- Seed a starter human-todo list so the admin UI shows actionable items on first load.
insert into public.backlink_todos (title, description, priority, status)
values
  ('Upload Semrush API key to Vercel env (SEMRUSH_API_KEY)', 'Without this, the prospect_discovery + disavow_generator agents are no-ops. Get key from Semrush > Profile > API.', 'high', 'open'),
  ('Top up Apollo credits OR plan around crawled emails', 'Contact_enrichment falls back to /contact, /about page scraping. Apollo would add LinkedIn URLs + verified emails.', 'medium', 'open'),
  ('Claim listings on G2, Capterra, GetApp', 'High-DA SaaS directories. ~30 min each. Collect 3-5 user reviews before submitting.', 'high', 'open'),
  ('Plan first Federal News Network pitch — pick a data angle', 'Best Tier-1 target. Need a non-obvious data story (e.g. agency conversion-rate analysis from our 57k opps).', 'high', 'open'),
  ('Drop one Vercel cron to make room for backlinks_orchestrator', 'Project is at 41 crons; Pro limit is 40. Easiest drop: enrich_gov_contacts_apollo (no Apollo credits anyway).', 'high', 'open');
