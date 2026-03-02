-- Migration: Phase 14 - Expand Contractors Schema
-- Purpose: Accommodate the rich 500MB+ SAM.gov Entity Registration (.dat) extract.

-- 1. Create Lookup ENUMs for Certifications (if they don't exist)
DO $$ BEGIN
    CREATE TYPE sba_certification_type AS ENUM (
        'SBA',         -- Small Business Administration
        'SDB',         -- Small Disadvantaged Business
        'WOSB',        -- Women-Owned Small Business
        'EDWOSB',      -- Economically Disadvantaged WOSB
        'VOSB',        -- Veteran-Owned Small Business
        'SDVOSB',      -- Service-Disabled Veteran-Owned
        '8A',          -- 8(a) Business Development Program
        'HUBZone',     -- HUBZone Program
        'MINORITY',    -- Minority Owned Business
        'NATIVE'       -- Native American Owned Business
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Expand Contractors Table structure
-- We add detailed fields based on the SAM.gov extract structure.

ALTER TABLE IF EXISTS public.contractors
    ADD COLUMN IF NOT EXISTS dba_name text,
    ADD COLUMN IF NOT EXISTS address_line_1 text,
    ADD COLUMN IF NOT EXISTS address_line_2 text,
    ADD COLUMN IF NOT EXISTS city text,
    ADD COLUMN IF NOT EXISTS zip_code varchar(20),
    ADD COLUMN IF NOT EXISTS country_code varchar(3), -- e.g., USA
    
    ADD COLUMN IF NOT EXISTS business_url text,
    ADD COLUMN IF NOT EXISTS activation_date date,
    ADD COLUMN IF NOT EXISTS expiration_date date,
    
    -- POC (Point of Contact) Details
    ADD COLUMN IF NOT EXISTS primary_poc_name text,
    ADD COLUMN IF NOT EXISTS primary_poc_email text,
    ADD COLUMN IF NOT EXISTS primary_poc_phone varchar(50),
    ADD COLUMN IF NOT EXISTS secondary_poc_name text,
    ADD COLUMN IF NOT EXISTS secondary_poc_email text,
    ADD COLUMN IF NOT EXISTS secondary_poc_phone varchar(50),

    -- Explicit Certifications Array (can hold multiple ENUM values as strings)
    ADD COLUMN IF NOT EXISTS sba_certifications text[],
    ADD COLUMN IF NOT EXISTS psc_codes text[];

-- Ensure constraints and indexes for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS contractors_uei_idx ON public.contractors (uei);
CREATE INDEX IF NOT EXISTS contractors_cage_code_idx ON public.contractors (cage_code);
CREATE INDEX IF NOT EXISTS contractors_state_idx ON public.contractors (state);
CREATE INDEX IF NOT EXISTS contractors_expiration_date_idx ON public.contractors (expiration_date);

-- FTS (Full Text Search) capability update
ALTER TABLE IF EXISTS public.contractors
ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(company_name, '') || ' ' || coalesce(dba_name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state, ''))
) STORED;

CREATE INDEX IF NOT EXISTS contractors_fts_idx ON public.contractors USING GIN (fts);

-- Enable RLS and Add Policies (Optional but recommended)
-- ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all viewing of contractors" ON public.contractors FOR SELECT USING (true);
