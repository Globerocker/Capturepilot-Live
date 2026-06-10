-- Migration 035: Lock down public inserts on company_analyses.
--
-- Before: `WITH CHECK (true)` allowed any anon user to spam the table and
-- harvest leads via `lead_email`. After: a SECURITY DEFINER function gates
-- inserts on URL shape + rate limit, and the insert policy delegates to it.
--
-- The Vercel route at /api/analyze-company also enforces a captcha token
-- + per-IP rate limit in front of the DB — this migration is the durable
-- backstop for anything that bypasses the route (direct PostgREST hits).

-- 1. Per-IP / per-host rate-limit ledger. Lightweight rolling window.
CREATE TABLE IF NOT EXISTS crawl_rate_limit (
    bucket_key TEXT PRIMARY KEY,
    hit_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crawl_rate_limit_window ON crawl_rate_limit(window_started_at);

-- 2. SECURITY DEFINER helper — bumps the counter, returns true if under the cap.
--    Window: 60s. Cap: 10/min per bucket (intentionally looser than the route's
--    3/min so we don't double-reject legit users — this is just the abuse brake).
CREATE OR REPLACE FUNCTION rl_bump(p_bucket TEXT, p_max_per_min INTEGER DEFAULT 10)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_count INTEGER;
BEGIN
    INSERT INTO crawl_rate_limit (bucket_key, hit_count, window_started_at, updated_at)
    VALUES (p_bucket, 1, v_now, v_now)
    ON CONFLICT (bucket_key) DO UPDATE
        SET hit_count = CASE
                WHEN crawl_rate_limit.window_started_at < v_now - INTERVAL '60 seconds'
                THEN 1
                ELSE crawl_rate_limit.hit_count + 1
            END,
            window_started_at = CASE
                WHEN crawl_rate_limit.window_started_at < v_now - INTERVAL '60 seconds'
                THEN v_now
                ELSE crawl_rate_limit.window_started_at
            END,
            updated_at = v_now
    RETURNING hit_count INTO v_count;

    RETURN v_count <= p_max_per_min;
END;
$$;

REVOKE ALL ON FUNCTION rl_bump(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rl_bump(TEXT, INTEGER) TO anon, authenticated, service_role;

-- 3. URL shape validator. Rejects rows whose website doesn't look like a real
--    public site. Mirrors the JS-side `validateCrawlUrl` so the two stay aligned.
CREATE OR REPLACE FUNCTION is_valid_crawl_url(p_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_host TEXT;
BEGIN
    IF p_url IS NULL OR length(p_url) < 8 OR length(p_url) > 500 THEN
        RETURN FALSE;
    END IF;
    IF p_url !~* '^https?://' THEN
        RETURN FALSE;
    END IF;
    -- Pull the hostname out without trying to parse a full URL.
    v_host := lower(regexp_replace(p_url, '^https?://([^/]+).*$', '\1'));
    v_host := regexp_replace(v_host, '^www\.', '');
    IF length(v_host) < 4 OR position('.' in v_host) = 0 THEN
        RETURN FALSE;
    END IF;
    -- Reject IP literals + localhost.
    IF v_host ~ '^\d+\.\d+\.\d+\.\d+$' OR v_host IN ('localhost') OR v_host LIKE '%.local' THEN
        RETURN FALSE;
    END IF;
    -- Block known abuse TLDs.
    IF v_host ~ '\.(ru|cn|tk|ml|ga|cf|gq|click|zip)$' THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;

-- 4. Insert-gate helper used by the RLS policy. Combines URL check + rate limit.
--    Bucket key is the website host so a single domain can't be re-inserted
--    more than 10x/min even from rotating IPs.
CREATE OR REPLACE FUNCTION can_insert_company_analysis(p_website TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_host TEXT;
BEGIN
    IF NOT is_valid_crawl_url(p_website) THEN
        RETURN FALSE;
    END IF;
    v_host := lower(regexp_replace(p_website, '^https?://([^/]+).*$', '\1'));
    v_host := regexp_replace(v_host, '^www\.', '');
    RETURN rl_bump('company_analyses:' || v_host, 10);
END;
$$;

REVOKE ALL ON FUNCTION can_insert_company_analysis(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_insert_company_analysis(TEXT) TO anon, authenticated, service_role;

-- 5. Replace the wide-open `WITH CHECK (true)` policy.
DROP POLICY IF EXISTS "Allow anonymous insert on company_analyses" ON company_analyses;

CREATE POLICY "company_analyses_insert_gated"
    ON company_analyses FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        website IS NOT NULL
        AND length(website) BETWEEN 8 AND 500
        AND is_valid_crawl_url(website)
        AND can_insert_company_analysis(website)
    );

-- 6. Service role bypasses RLS by default but keep an explicit policy in
--    case someone disables `BYPASSRLS` on the role.
DROP POLICY IF EXISTS "company_analyses_service_full" ON company_analyses;
CREATE POLICY "company_analyses_service_full"
    ON company_analyses FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON FUNCTION rl_bump(TEXT, INTEGER) IS
    'Sliding 60s window rate limit. Returns TRUE while under cap.';
COMMENT ON FUNCTION can_insert_company_analysis(TEXT) IS
    'Gate for the company_analyses insert RLS policy. Validates URL shape and bumps the per-host counter.';
