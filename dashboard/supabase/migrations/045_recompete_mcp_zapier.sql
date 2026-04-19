-- ============================================================
-- Migration 045 — Recompete Radar + Past-Perf + MCP + Zapier
-- ============================================================
-- Supports:
--   • Recompete Radar  → scans FPDS / USASpending for expiring contracts
--                        and scores recompete likelihood (P1 feature)
--   • Past-Performance → synthesized CPARS-proxy rating per UEI, derived
--                        from FPDS modifications + GAO protests + retention
--   • MCP + Zapier     → third-party integration audit trail (API tokens,
--                        outbound webhook subscriptions, delivery log)
--   • Compliance Matrix cache → reuse extracted Section-L/M matrices
--   • Capability Matrix cache → reuse AI company × opp scoring

-- ------------------------------------------------------------
-- Recompete candidates
-- ------------------------------------------------------------
create table if not exists public.recompete_candidates (
    id                    uuid primary key default gen_random_uuid(),
    source_award_id       text,                         -- FPDS award id / USASpending generated_unique_id
    incumbent_uei         text,
    incumbent_name        text,
    agency                text,
    naics_code            text,
    psc_code              text,
    set_aside             text,
    original_award_value  numeric,
    contract_end_date     date,
    months_to_end         integer,
    confidence            text check (confidence in ('high','medium','low')),
    confidence_score      numeric check (confidence_score between 0 and 1),
    reasoning             text,
    matched_sam_notice_id text,                         -- if a new solicitation has dropped
    created_at            timestamptz not null default now(),
    last_refreshed_at     timestamptz not null default now()
);

create unique index if not exists uq_recompete_source_award
    on public.recompete_candidates (source_award_id) where source_award_id is not null;
create index if not exists idx_recompete_agency_naics
    on public.recompete_candidates (agency, naics_code);
create index if not exists idx_recompete_end_date
    on public.recompete_candidates (contract_end_date)
    where contract_end_date is not null;
create index if not exists idx_recompete_confidence
    on public.recompete_candidates (confidence, confidence_score desc);

-- ------------------------------------------------------------
-- Past-performance proxy ratings (CPARS is not public; this is synthesized)
-- ------------------------------------------------------------
create table if not exists public.past_perf_ratings (
    uei                   text primary key,
    contractor_name       text,
    total_contracts       integer,
    total_value_usd       numeric,
    completed_contracts   integer,
    modification_count    integer,
    avg_modifications     numeric,
    extension_ratio       numeric,                      -- option-exercises / completed
    termination_count     integer,
    protest_against_count integer,
    protest_filed_count   integer,
    primary_agencies      text[]       default '{}'::text[],
    repeat_customer_ratio numeric,                      -- % of their awards from top 3 agencies
    rating                text check (rating in ('exceptional','very_good','satisfactory','marginal','unsatisfactory','insufficient_data')),
    rating_score          numeric check (rating_score between 0 and 1),
    reasoning             text,
    computed_at           timestamptz not null default now()
);

create index if not exists idx_past_perf_rating on public.past_perf_ratings (rating);

-- ------------------------------------------------------------
-- Compliance Matrix cache (reuse extraction within 14 days)
-- ------------------------------------------------------------
create table if not exists public.compliance_matrices (
    id                uuid primary key default gen_random_uuid(),
    opportunity_id    uuid not null,
    notice_id         text,
    matrix_json       jsonb not null,                   -- rows: {section, requirement, obligation_verb, owner, status}
    compliance_score  numeric,                          -- % of requirements addressable by user profile
    model_used        text,
    generated_at      timestamptz not null default now()
);

create index if not exists idx_compliance_opp on public.compliance_matrices (opportunity_id, generated_at desc);

-- ------------------------------------------------------------
-- Capability Matrix cache (per user × opp)
-- ------------------------------------------------------------
create table if not exists public.capability_matrices (
    id                uuid primary key default gen_random_uuid(),
    user_profile_id   uuid not null references public.user_profiles(id) on delete cascade,
    opportunity_id    uuid not null,
    matrix_json       jsonb not null,                   -- rows: {factor, user_strength, opp_requirement, gap, mitigation}
    overall_fit       text check (overall_fit in ('strong','moderate','weak','poor')),
    generated_at      timestamptz not null default now()
);

create index if not exists idx_capability_user_opp
    on public.capability_matrices (user_profile_id, opportunity_id, generated_at desc);

-- ------------------------------------------------------------
-- MCP / Zapier API tokens
-- ------------------------------------------------------------
create table if not exists public.api_tokens (
    id              uuid primary key default gen_random_uuid(),
    user_profile_id uuid not null references public.user_profiles(id) on delete cascade,
    token_prefix    text not null,                     -- first 8 chars, for UI display
    token_hash      text not null unique,              -- SHA-256 of full token
    kind            text not null check (kind in ('mcp','zapier','api')),
    label           text,
    last_used_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_api_tokens_user on public.api_tokens (user_profile_id) where revoked_at is null;

-- ------------------------------------------------------------
-- Webhook endpoints (Zapier-style outbound)
-- ------------------------------------------------------------
create table if not exists public.webhook_endpoints (
    id              uuid primary key default gen_random_uuid(),
    user_profile_id uuid not null references public.user_profiles(id) on delete cascade,
    url             text not null,
    events          text[] not null default '{}'::text[],   -- ['pursuit.added','match.hot','opportunity.dropped']
    secret          text,
    active          boolean not null default true,
    created_at      timestamptz not null default now()
);

create index if not exists idx_webhook_user_active
    on public.webhook_endpoints (user_profile_id) where active = true;

-- ------------------------------------------------------------
-- Webhook delivery log
-- ------------------------------------------------------------
create table if not exists public.webhook_deliveries (
    id              uuid primary key default gen_random_uuid(),
    webhook_id      uuid not null references public.webhook_endpoints(id) on delete cascade,
    event           text not null,
    payload         jsonb not null,
    status_code     integer,
    response_text   text,
    error_message   text,
    attempt         integer not null default 1,
    delivered_at    timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_wid
    on public.webhook_deliveries (webhook_id, delivered_at desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.recompete_candidates   enable row level security;
alter table public.past_perf_ratings      enable row level security;
alter table public.compliance_matrices    enable row level security;
alter table public.capability_matrices    enable row level security;
alter table public.api_tokens             enable row level security;
alter table public.webhook_endpoints      enable row level security;
alter table public.webhook_deliveries     enable row level security;

do $$
begin
    -- Reference tables: read-only for all authenticated users
    if not exists (select 1 from pg_policies where tablename='recompete_candidates' and policyname='recompete_read') then
        create policy "recompete_read" on public.recompete_candidates for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='past_perf_ratings' and policyname='past_perf_read') then
        create policy "past_perf_read" on public.past_perf_ratings for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='compliance_matrices' and policyname='compliance_read') then
        create policy "compliance_read" on public.compliance_matrices for select using (true);
    end if;

    -- User-scoped tables
    if not exists (select 1 from pg_policies where tablename='capability_matrices' and policyname='capability_owner') then
        create policy "capability_owner" on public.capability_matrices for all
            using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));
    end if;
    if not exists (select 1 from pg_policies where tablename='api_tokens' and policyname='api_tokens_owner') then
        create policy "api_tokens_owner" on public.api_tokens for all
            using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));
    end if;
    if not exists (select 1 from pg_policies where tablename='webhook_endpoints' and policyname='webhooks_owner') then
        create policy "webhooks_owner" on public.webhook_endpoints for all
            using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));
    end if;
    if not exists (select 1 from pg_policies where tablename='webhook_deliveries' and policyname='webhook_deliveries_owner') then
        create policy "webhook_deliveries_owner" on public.webhook_deliveries for select
            using (webhook_id in (
                select id from public.webhook_endpoints where user_profile_id in (
                    select id from public.user_profiles where auth_user_id = auth.uid()
                )
            ));
    end if;
end
$$;
