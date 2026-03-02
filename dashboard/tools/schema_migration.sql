-- ==========================================
-- Phase 13: SAM.gov Masterguide Schema
-- ==========================================

-- 1. ENUMS & LOOKUP TABLES
-- ==========================================
CREATE TABLE IF NOT EXISTS opportunity_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);
INSERT INTO opportunity_types (name) VALUES 
('Solicitation'), ('Combined Synopsis/Solicitation'), ('Presolicitation'), ('Sources Sought'), ('Award Notice')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS set_asides (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);
-- Note: Mappings will be handled in the ingestion script, these are the canonical codes
INSERT INTO set_asides (code) VALUES 
('SBA'), ('SBP'), ('8A'), ('8AN'), ('HZC'), ('HZS'), ('SDVOSBC'), ('SDVOSBS'), ('WOSB'), ('WOSBSS'), ('EDWOSB'), ('VSA'), ('NONE')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);
INSERT INTO archive_types (name) VALUES 
('Archived'), ('Cancelled'), ('Modified'), ('Replaced')
ON CONFLICT (name) DO NOTHING;


-- 2. FOREIGN KEY ENTITIES
-- ==========================================
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department VARCHAR(255),
    sub_tier VARCHAR(255),
    office VARCHAR(255),
    cgac VARCHAR(50),
    fpds_code VARCHAR(50),
    aac_code VARCHAR(50),
    organization_type VARCHAR(100),
    UNIQUE (department, sub_tier, office) -- Ensure uniqueness for upserts
);

CREATE TABLE IF NOT EXISTS naics_codes (
    code VARCHAR(10) PRIMARY KEY,
    industry_title TEXT
);

CREATE TABLE IF NOT EXISTS psc_codes (
    code VARCHAR(10) PRIMARY KEY,
    description TEXT
);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    street_address TEXT,
    city VARCHAR(255),
    state VARCHAR(50),
    zip VARCHAR(50),
    country VARCHAR(100)
    -- Typically wouldn't unique-constrain an exact address layout without heavy cleaning, 
    -- but for normalization we'll unique constraint the combo.
);
-- Add a unique constraint purely to facilitate ON CONFLICT DO UPDATE returning ID
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_unique_idx;
ALTER TABLE locations ADD CONSTRAINT locations_unique_idx UNIQUE NULLS NOT DISTINCT (street_address, city, state, zip, country);


-- 3. CORE OPPORTUNITIES TABLE
-- ==========================================
-- We will create a fresh table to avoid type conflicts with the old flat table,
-- then we can migrate or drop the old one. We'll call it 'opportunities_v2' for safety
-- during migration, then rename it.

CREATE TABLE IF NOT EXISTS opportunities_v2 (
    notice_id VARCHAR(255) PRIMARY KEY,
    title TEXT NOT NULL,
    solicitation_number VARCHAR(255),
    
    posted_date TIMESTAMPTZ,
    response_deadline TIMESTAMPTZ,
    
    opportunity_type_id INTEGER REFERENCES opportunity_types(id),
    agency_id UUID REFERENCES agencies(id),
    naics_code VARCHAR(10) REFERENCES naics_codes(code),
    psc_code VARCHAR(10) REFERENCES psc_codes(code),
    set_aside_id INTEGER REFERENCES set_asides(id),
    
    award_amount NUMERIC,
    award_date TIMESTAMPTZ,
    award_number VARCHAR(255),
    awardee TEXT,
    
    description TEXT,
    link TEXT,
    additional_info_link TEXT,
    
    active BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 4. CONTACTS ENTITY (Linked by notice_id)
-- ==========================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notice_id VARCHAR(255) REFERENCES opportunities_v2(notice_id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    title VARCHAR(255),
    fullname VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(100),
    fax VARCHAR(100),
    UNIQUE (notice_id, email, fullname) -- Prevent duplicate identical contacts per notice
);


-- 5. INDEXING STRATEGY
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_opps_posted_date ON opportunities_v2(posted_date);
CREATE INDEX IF NOT EXISTS idx_opps_response_deadline ON opportunities_v2(response_deadline);
CREATE INDEX IF NOT EXISTS idx_opps_agency_id ON opportunities_v2(agency_id);
CREATE INDEX IF NOT EXISTS idx_opps_naics_code ON opportunities_v2(naics_code);
CREATE INDEX IF NOT EXISTS idx_opps_set_aside_id ON opportunities_v2(set_aside_id);
CREATE INDEX IF NOT EXISTS idx_opps_award_amount ON opportunities_v2(award_amount);

-- Full-text search index on description
-- We add a generated column for the tsvector
ALTER TABLE opportunities_v2 ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_opps_fts ON opportunities_v2 USING GIN (fts);


-- 6. RENAME / SWAP (Optional, doing at the end of script)
-- ==========================================
-- Drop old flat table and rename
DROP TABLE IF EXISTS opportunities CASCADE;
ALTER TABLE opportunities_v2 RENAME TO opportunities;

-- Update the contacts reference to the new name (it auto-updates in Postgres, but recreating the constraint to be clean)
-- The foreign key automatically tracks the rename in modern Postgres.
