/**
 * SAM.gov API key split — separate keys for separate use cases so quota /
 * rate-limit problems on one path don't take down the other.
 *
 *   SAM_API_KEY     → Opportunities API (ingest_sam, attachments, descriptions,
 *                     opportunity-search). High volume, runs daily ingest.
 *   SAM_API_KEY_2   → Entity Management API (sam/entity, enrich-profile,
 *                     partners/search, analyze-company). Lower volume but
 *                     bursty — Quick Checker fires N entity lookups per run.
 *
 * SAM.gov rate limits per key: 1000 req/hour (X-RateLimit-Limit). Splitting
 * the two paths doubles our effective throughput and isolates failure modes.
 *
 * Backward compat: if SAM_API_KEY_2 is not configured, contractor calls fall
 * back to SAM_API_KEY so nothing breaks during the env-var rollout.
 */

export const SAM_OPPORTUNITY_KEY = process.env.SAM_API_KEY || "";

export const SAM_CONTRACTOR_KEY =
    process.env.SAM_API_KEY_2
    || process.env.SAM_API_KEY
    || "";

/** Header object for SAM.gov fetch() calls. Use the appropriate constant for
 *  the call's domain. NEVER use api_key query param — SAM deprecated it. */
export const samHeaders = (key: string): Record<string, string> => ({
    "X-Api-Key": key,
});
