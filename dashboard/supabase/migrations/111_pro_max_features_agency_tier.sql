-- Pro maxes out + Enterprise → Agency.
--
-- WHY: The pricing audit (June 2026) showed Pro at $89/mo was missing too
-- many features compared to Enterprise, making Enterprise look mandatory
-- for power users. Real intent: Pro should be the "ceiling" for a single
-- contractor, with Enterprise reserved for AGENCIES managing multiple
-- federal-contracting CLIENTS. Renamed Enterprise → Agency / Consultants
-- so the positioning is unambiguous.
--
-- New feature keys added to the limits JSONB so the agency tier has a real
-- selling point beyond "unlimited" — these are tracked + gated server-side
-- via the same plan-tier helpers in src/lib/plan-tier.ts:
--   client_management    — multi-client workspace, per-client dashboards
--   client_portal        — light-view portal handed to each client
--   white_label          — custom domain + logo replacement
--   bulk_proposal_gen    — generate proposals for N opportunities at once (token-heavy)
--   priority_ai_models   — gpt-4o for AI features (vs gpt-4o-mini on Pro)
--   dedicated_support    — Slack channel + named CSM
--   bulk_outreach        — outbound email/SMS campaigns to prospect list
--
-- Pro takes everything that's NOT agency-specific. Agency = Pro + client mgmt
-- + token-heavy features.

delete from public.plan_tiers
 where code in ('enterprise', 'agency', 'pro', 'light', 'free');

-- Free — 14d trial fallback. Light gating so they feel friction.
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
        'client_management', false,
        'client_portal', false,
        'white_label', false,
        'bulk_proposal_gen', false,
        'priority_ai_models', false,
        'dedicated_support', false,
        'bulk_outreach', false,
        'team_seats', 1
    ));

-- Light — $39/mo. Federal-only matches at higher quotas + competitor/partner profiles.
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
        'client_management', false,
        'client_portal', false,
        'white_label', false,
        'bulk_proposal_gen', false,
        'priority_ai_models', false,
        'dedicated_support', false,
        'bulk_outreach', false,
        'team_seats', 1
    ));

-- Pro — $89/mo. MAX features for a single contractor: SLED, AI, exports,
-- API, generous matches/proposal/team quotas. The only things NOT in Pro
-- are agency-multi-tenant + token-heavy compute capabilities.
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('pro', 'Pro', 89, 854, 30, true, jsonb_build_object(
        'max_saved_searches', 9999,
        'proposals_per_month', 100,
        'matches_per_day', 9999,
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
        'client_management', false,
        'client_portal', false,
        'white_label', false,
        'bulk_proposal_gen', false,
        'priority_ai_models', false,
        'dedicated_support', false,
        'bulk_outreach', false,
        'team_seats', 5
    ));

-- Agency / Consultants — $399/mo. For B2G consultancies + agencies running
-- federal capture for multiple clients. Pro + multi-tenant + token-heavy
-- + done-for-you toolkit.
--
-- Pricing logic: at $399/mo it's profitable even with 3x the GPT-4o spend
-- of Pro, and it's still 10-20× cheaper than GovWin/Deltek for an agency
-- running 5+ clients. Keep this Stripe-price-less for now (contact sales);
-- when we have ≥3 buyers asking, productize a real Payment Link.
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('agency', 'Agencies & Consultants', 399, 3830, 40, true, jsonb_build_object(
        'max_saved_searches', 9999,
        'proposals_per_month', 9999,
        'matches_per_day', 99999,
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
        'client_management', true,
        'client_portal', true,
        'white_label', true,
        'bulk_proposal_gen', true,
        'priority_ai_models', true,
        'dedicated_support', true,
        'bulk_outreach', true,
        'team_seats', 9999
    ));

-- Migrate anyone still on enterprise → agency so they keep access.
update public.user_profiles
   set plan_tier = 'agency'
 where plan_tier = 'enterprise';

notify pgrst, 'reload schema';
