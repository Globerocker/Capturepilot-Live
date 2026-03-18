-- Sprint 19: Competitor Tracking Schema
-- Run this SQL in the Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS public.competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    uei TEXT UNIQUE,
    cage_code TEXT,
    website_url TEXT,
    tracked_naics TEXT[],
    win_rate NUMERIC,
    total_awards_tracked INTEGER DEFAULT 0,
    strengths TEXT[],
    weaknesses TEXT[],
    last_crawled_at TIMESTAMPTZ,
    auto_track BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.competitor_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE,
    source_url TEXT,
    extracted_insight TEXT,
    insight_type TEXT CHECK (insight_type IN ('pricing_intel', 'teaming_partner', 'key_personnel', 'tech_stack', 'general')),
    confidence_score NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitors_uei ON public.competitors(uei);
CREATE INDEX IF NOT EXISTS idx_competitors_naics ON public.competitors USING GIN(tracked_naics);
CREATE INDEX IF NOT EXISTS idx_competitor_intel_competitor ON public.competitor_intelligence(competitor_id);
