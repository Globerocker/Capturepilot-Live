-- Plan-tier restructure: Light ($39) + Pro ($89) with 14-day trial.
--
-- Replaces the original Starter ($49) / Pro ($149) pricing locked in
-- migration 071. Pricing rationale + competitor benchmark live in
-- docs/PRICING_STRATEGY.md — see that doc before changing prices again.
--
-- Strategy in one sentence: be cheaper than GovTribe ($112-150/mo) and
-- SamSearch ($99-199/mo) on entry tier, undercut everyone offering both
-- SLED + AI on Pro, but bundle enough value (full SLED coverage + AI
-- proposals + competitor/partner intel) that we don't signal "cheap = bad".
--
-- New feature keys added to limits JSONB (callers must use these):
--   state_local_access  — SLED opportunity feed (Pro+ only)
--   competitor_profiles — view competitor pages (Light+)
--   partner_profiles    — view + save partner pages (Light+)
--   export_data         — CSV/XLSX downloads (Pro+ only, anti-scrape)
--   ai_proposals        — proposal writer (Pro+ only)
--   ai_summaries        — opportunity summaries (Pro+ only)
--
-- Existing keys kept: max_saved_searches, proposals_per_month,
-- matches_per_day, capability_statement_ai, sam_passthrough,
-- partners_search, api_access, team_seats.

-- Drop the existing seed rows by code so we don't UPSERT-conflict.
-- We keep the plan_tiers TABLE itself (schema unchanged) — only the
-- row content changes.
delete from public.plan_tiers
 where code in ('free', 'starter', 'pro', 'enterprise');

-- Free — what users land on after their 14-day trial expires without
-- upgrading. Intentionally limited so they feel the friction (a couple
-- of saved searches, a small matches/day quota, no SLED, no AI, no API).
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('free', 'Free', 0, null, 10, true, jsonb_build_object(
        'max_saved_searches', 1,
        'proposals_per_month', 0,
        'matches_per_day', 50,
        'capability_statement_ai', false,
        'sam_passthrough', false,
        'partners_search', false,
        'competitor_profiles', false,
        'partner_profiles', false,
        'state_local_access', false,
        'ai_proposals', false,
        'ai_summaries', false,
        'export_data', false,
        'api_access', false,
        'team_seats', 1
    ));

-- Light — $39/mo. Federal-only opportunities at higher matches/day than
-- Free, plus full access to competitor + partner profiles. Designed so
-- the gap to Pro feels meaningful (SLED + AI + export + API are the
-- selling points of upgrading).
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('light', 'Light', 39, 374, 20, true, jsonb_build_object(
        'max_saved_searches', 5,
        'proposals_per_month', 0,
        'matches_per_day', 200,
        'capability_statement_ai', false,
        'sam_passthrough', true,
        'partners_search', true,
        'competitor_profiles', true,
        'partner_profiles', true,
        'state_local_access', false,
        'ai_proposals', false,
        'ai_summaries', false,
        'export_data', false,
        'api_access', false,
        'team_seats', 1
    ));

-- Pro — $89/mo. Everything: SLED, AI proposals, AI summaries, capability
-- statement AI editing, exports, API access, 3 team seats.
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('pro', 'Pro', 89, 854, 30, true, jsonb_build_object(
        'max_saved_searches', 25,
        'proposals_per_month', 25,
        'matches_per_day', 1000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'competitor_profiles', true,
        'partner_profiles', true,
        'state_local_access', true,
        'ai_proposals', true,
        'ai_summaries', true,
        'export_data', true,
        'api_access', true,
        'team_seats', 3
    ));

-- Enterprise — contact-sales pricing (no Stripe price ID). Custom seats
-- + SLA + dedicated support. Limits effectively unlimited.
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('enterprise', 'Enterprise', null, null, 40, true, jsonb_build_object(
        'max_saved_searches', 999,
        'proposals_per_month', 999,
        'matches_per_day', 10000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'competitor_profiles', true,
        'partner_profiles', true,
        'state_local_access', true,
        'ai_proposals', true,
        'ai_summaries', true,
        'export_data', true,
        'api_access', true,
        'team_seats', 999
    ));

-- Bump any existing user_profiles still pointing at the dropped 'starter'
-- tier code over to 'light' so nobody loses access. Pro stays Pro.
update public.user_profiles set plan_tier = 'light' where plan_tier = 'starter';

notify pgrst, 'reload schema';
