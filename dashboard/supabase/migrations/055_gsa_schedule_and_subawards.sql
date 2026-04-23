-- ============================================================
-- Migration 055 — GSA Schedule holders + USASpending sub-awards
-- ============================================================
-- Two new tables to close the teaming-intelligence gaps identified on
-- 2026-04-22:
--   1. gsa_schedule_holders — companies on GSA MAS contracts (who can we
--      team with, who sells at what ceiling rate). Populated daily from
--      GSA eLibrary + GSA Advantage scrapes.
--   2. subaward_edges — prime → sub relationships pulled from
--      USASpending sub-awards API. The missing sub-contracting graph.
-- ============================================================

-- ------------------------------------------------------------
-- gsa_schedule_holders
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gsa_schedule_holders (
    id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    contract_no   text NOT NULL,
    company_name  text NOT NULL,
    uei           text,
    duns          text,
    cage_code     text,
    schedule      text,             -- e.g. "MAS", "IT Schedule 70"
    sin_codes     text[] DEFAULT '{}'::text[],
    naics_codes   text[] DEFAULT '{}'::text[],
    small_business boolean DEFAULT false,
    certifications text[] DEFAULT '{}'::text[],  -- 8(a), HUBZone, SDVOSB, WOSB
    phone         text,
    email         text,
    website       text,
    address       text,
    state         text,
    contract_start_date date,
    contract_end_date   date,
    ceiling_value       numeric,
    source        text DEFAULT 'gsa_elibrary',
    created_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now(),
    UNIQUE (contract_no, company_name)
);

CREATE INDEX IF NOT EXISTS idx_gsa_holders_uei            ON public.gsa_schedule_holders (uei);
CREATE INDEX IF NOT EXISTS idx_gsa_holders_state          ON public.gsa_schedule_holders (state);
CREATE INDEX IF NOT EXISTS idx_gsa_holders_naics_gin      ON public.gsa_schedule_holders USING gin (naics_codes);
CREATE INDEX IF NOT EXISTS idx_gsa_holders_sin_gin        ON public.gsa_schedule_holders USING gin (sin_codes);
CREATE INDEX IF NOT EXISTS idx_gsa_holders_certs_gin      ON public.gsa_schedule_holders USING gin (certifications);

-- ------------------------------------------------------------
-- subaward_edges (USASpending sub-award graph)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subaward_edges (
    id              uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    prime_uei       text NOT NULL,
    prime_name      text,
    sub_uei         text NOT NULL,
    sub_name        text,
    prime_award_id  text,            -- USASpending contract PIID
    subaward_amount numeric,
    subaward_date   date,
    naics_code      text,
    agency          text,
    description     text,
    source          text DEFAULT 'usaspending_api',
    fetched_at      timestamptz DEFAULT now(),
    UNIQUE (prime_uei, sub_uei, prime_award_id, subaward_date)
);

CREATE INDEX IF NOT EXISTS idx_subawards_prime_uei    ON public.subaward_edges (prime_uei);
CREATE INDEX IF NOT EXISTS idx_subawards_sub_uei      ON public.subaward_edges (sub_uei);
CREATE INDEX IF NOT EXISTS idx_subawards_agency       ON public.subaward_edges (agency);
CREATE INDEX IF NOT EXISTS idx_subawards_date         ON public.subaward_edges (subaward_date DESC);

-- ------------------------------------------------------------
-- RLS — both tables are public reference data for authenticated users
-- ------------------------------------------------------------
ALTER TABLE public.gsa_schedule_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subaward_edges       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gsa_schedule_holders' AND policyname='gsa_holders_read_auth') THEN
        CREATE POLICY gsa_holders_read_auth ON public.gsa_schedule_holders
            FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subaward_edges' AND policyname='subawards_read_auth') THEN
        CREATE POLICY subawards_read_auth ON public.subaward_edges
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
