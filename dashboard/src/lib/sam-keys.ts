/**
 * SAM.gov API key split — separate keys for separate use cases so quota /
 * rate-limit problems on one path don't take down the other, plus round-
 * robin within the ingest pool to multiply effective throughput.
 *
 *   SAM_API_KEY      → Opportunity-ingest pool member #1
 *   SAM_API_KEY_3    → Opportunity-ingest pool member #2 (added 2026-06-08)
 *   SAM_API_KEY_2    → Entity Management API (sam/entity, enrich-profile,
 *                      partners/search, analyze-company)
 *
 * SAM.gov rate limits each key independently at 1000 req/hour. The opportunity
 * pool round-robins between keys so the effective ceiling is ~2000 req/hour
 * for ingest_sam / attachments / descriptions / opportunity-search. Entity
 * lookups stay on a dedicated key to avoid quota contention with bursty
 * Quick Checker runs.
 *
 * Backward compat: missing keys are filtered out — single-key deploys still
 * work, three-key deploys get the round-robin boost automatically.
 */

const OPPORTUNITY_POOL = [
    process.env.SAM_API_KEY,
    process.env.SAM_API_KEY_3,
].filter((k): k is string => !!k && k.length > 10);

let _rrIdx = 0;

/** Round-robin one of the opportunity-pool keys. Falls back to "" if no keys
 *  are configured (caller is responsible for the resulting 401). Each call
 *  advances the cursor so back-to-back calls hit different keys. */
export function getOpportunityKey(): string {
    if (OPPORTUNITY_POOL.length === 0) return "";
    const k = OPPORTUNITY_POOL[_rrIdx % OPPORTUNITY_POOL.length];
    _rrIdx++;
    return k;
}

/** The full pool — for routes that want to do their own rotation/failover
 *  (e.g. ingest_sam loops keys on 401/403). Sorted by env-var index for
 *  determinism so retry logic can index into it predictably. */
export const SAM_OPPORTUNITY_POOL: readonly string[] = OPPORTUNITY_POOL;

/** Legacy constant — first opportunity key only. Most callers should switch
 *  to getOpportunityKey() to participate in the round-robin. Kept exported
 *  for routes that need a deterministic single key. */
export const SAM_OPPORTUNITY_KEY = OPPORTUNITY_POOL[0] || "";

export const SAM_CONTRACTOR_KEY =
    process.env.SAM_API_KEY_2
    || OPPORTUNITY_POOL[0]
    || "";

/** Header object for SAM.gov fetch() calls. Use the appropriate constant for
 *  the call's domain. NEVER use api_key query param — SAM deprecated it. */
export const samHeaders = (key: string): Record<string, string> => ({
    "X-Api-Key": key,
});
