-- 013: Add WOSB flag + preparation for broad NAICS crawling

-- 1. Add woman-owned business flag
DO $$ BEGIN
    ALTER TABLE opportunities ADD COLUMN wosb_relevance_flag BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_opps_wosb ON opportunities (wosb_relevance_flag) WHERE wosb_relevance_flag = true;

-- 2. Backfill WOSB flag from existing set_aside_code
UPDATE opportunities SET wosb_relevance_flag = true
WHERE set_aside_code ILIKE '%WOSB%'
   OR set_aside_code ILIKE '%Women%'
   OR set_aside_code ILIKE '%EDWOSB%'
   OR set_aside_code ILIKE '%Woman%';

-- 3. Fix veteran flag to also catch SDVOSB in set_aside_code
UPDATE opportunities SET veteran_relevance_flag = true
WHERE (set_aside_code ILIKE '%SDVOSB%'
   OR set_aside_code ILIKE '%VOSB%'
   OR set_aside_code ILIKE '%Veteran%'
   OR set_aside_code ILIKE '%Service-Disabled%')
   AND veteran_relevance_flag = false;

-- 4. Fix small_business flag to be more inclusive
UPDATE opportunities SET small_business_relevance_flag = true
WHERE (set_aside_code ILIKE '%Small%'
   OR set_aside_code ILIKE '%8(a)%'
   OR set_aside_code ILIKE '%HUBZone%'
   OR set_aside_code ILIKE '%SDVOSB%'
   OR set_aside_code ILIKE '%WOSB%'
   OR set_aside_code ILIKE '%SBA%'
   OR set_aside_code ILIKE '%SDB%')
   AND small_business_relevance_flag = false;
