-- ============================================================
-- 072 — plan_tiers.monthly_usd nullable + reseed (idempotent)
--
-- Hotfix: migration 071 declared monthly_usd as NOT NULL DEFAULT 0,
-- which rejects the Enterprise + Consulting tiers (custom pricing,
-- inserted with explicit NULL). The whole INSERT block aborted on
-- the first NULL row, leaving the plan_tiers table empty.
--
-- This migration:
--   1. Drops the NOT NULL constraint (safe to run twice — Postgres
--      ignores `DROP NOT NULL` when already nullable).
--   2. Re-runs the upsert from 071. The ON CONFLICT (code) DO UPDATE
--      handles both the rolled-back case (rows missing) and the
--      partially-applied case (some rows already there).
-- ============================================================

alter table public.plan_tiers alter column monthly_usd drop not null;

insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('free',       'Free',        0,    null,  10, true,  jsonb_build_object(
        'max_saved_searches', 1,
        'proposals_per_month', 0,
        'matches_per_day', 50,
        'capability_statement_ai', false,
        'sam_passthrough', false,
        'partners_search', false,
        'api_access', false,
        'team_seats', 1
    )),
    ('starter',    'Starter',     49,   470,   20, true,  jsonb_build_object(
        'max_saved_searches', 5,
        'proposals_per_month', 3,
        'matches_per_day', 200,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', false,
        'team_seats', 1
    )),
    ('pro',        'Pro',         149,  1430,  30, true,  jsonb_build_object(
        'max_saved_searches', 25,
        'proposals_per_month', 25,
        'matches_per_day', 1000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', true,
        'team_seats', 3
    )),
    ('enterprise', 'Enterprise',  null, null,  40, true,  jsonb_build_object(
        'max_saved_searches', 999,
        'proposals_per_month', 999,
        'matches_per_day', 10000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', true,
        'team_seats', 25
    )),
    ('consulting', 'Consulting',  null, null,  50, false, jsonb_build_object(
        'max_saved_searches', 999,
        'proposals_per_month', 999,
        'matches_per_day', 10000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', true,
        'team_seats', 5
    ))
on conflict (code) do update set
    label = excluded.label,
    monthly_usd = excluded.monthly_usd,
    yearly_usd = excluded.yearly_usd,
    sort_order = excluded.sort_order,
    is_public = excluded.is_public,
    limits = excluded.limits;
