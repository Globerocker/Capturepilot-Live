/**
 * Resolve SAM.gov description URLs to actual text content.
 *
 * SAM's opportunities API returns `description` as a URL pointing at a
 * second endpoint (https://api.sam.gov/.../v1/noticedesc?noticeid=...) for
 * un-enriched rows. The `bulk_enrich_descriptions` cron backfills text
 * eventually but lags ingest — Quick Checker frequently surfaces opps still
 * holding the URL, which renders as a missing description on /check/[id].
 *
 * This helper does parallel inline fetches for a small set of opps (typical
 * caller: top 10 Quick Checker matches) so the description text is
 * available before we hand the matches to the UI. Tuned for the
 * SAM.gov rate limit (~3 req/sec sustained):
 *   - Concurrency cap of 5
 *   - Per-request timeout of 8s (Quick Checker is interactive — fail fast)
 *   - Returns `null` for failures so callers can render a graceful fallback
 *
 * On success the resolved text is also written back to opportunities.description
 * so the next reader doesn't have to re-fetch. Failures are silent.
 */

import { createClient } from "@supabase/supabase-js";

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 5;

export interface DescriptionSource {
    opportunity_id: string;
    description: string | null | undefined;
}

export interface DescriptionResult {
    opportunity_id: string;
    /** Resolved description text. null if fetch failed OR there was nothing to resolve. */
    text: string | null;
    /** True if we fetched it just now (vs returning the value that was already text). */
    fetched: boolean;
}

function isFetchUrl(s: string | null | undefined): boolean {
    if (!s) return false;
    return /^https?:\/\//i.test(s.trim());
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/**
 * Fetch the description text behind a single SAM.gov noticedesc URL.
 * Returns the cleaned text or null on any failure.
 */
async function fetchOne(url: string): Promise<string | null> {
    if (!SAM_API_KEY) return null;
    try {
        const r = await fetch(url, {
            headers: { "X-Api-Key": SAM_API_KEY, Accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) return null;
        const raw = await r.text();
        let inner = raw;
        try {
            const parsed = JSON.parse(raw) as { description?: string };
            if (typeof parsed?.description === "string") inner = parsed.description;
        } catch { /* not JSON — fall through */ }
        const text = inner
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 12_000);
        return text.length >= 50 ? text : null;
    } catch {
        return null;
    }
}

/**
 * Resolve descriptions for a batch of opportunities. Items where the
 * description is already plain text pass through unchanged. URL items are
 * fetched in parallel (capped at CONCURRENCY).
 *
 * After all fetches complete, successful resolutions are persisted back to
 * the opportunities table so the next caller (cron, another quick check,
 * the main matches feed) doesn't re-fetch.
 */
export async function resolveDescriptions(
    sources: DescriptionSource[],
): Promise<Map<string, DescriptionResult>> {
    const out = new Map<string, DescriptionResult>();
    const toFetch: DescriptionSource[] = [];

    for (const s of sources) {
        if (s.description && !isFetchUrl(s.description)) {
            // Already text — pass through.
            out.set(s.opportunity_id, {
                opportunity_id: s.opportunity_id,
                text: s.description.trim().slice(0, 12_000),
                fetched: false,
            });
        } else if (s.description && isFetchUrl(s.description)) {
            toFetch.push(s);
        } else {
            out.set(s.opportunity_id, { opportunity_id: s.opportunity_id, text: null, fetched: false });
        }
    }

    // Parallel fetches, simple semaphore. Order doesn't matter — we map by id.
    const queue = [...toFetch];
    const workers: Promise<void>[] = [];
    const resolved: Array<{ id: string; text: string }> = [];

    for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const next = queue.shift();
                if (!next || !next.description) continue;
                const text = await fetchOne(next.description);
                out.set(next.opportunity_id, {
                    opportunity_id: next.opportunity_id,
                    text,
                    fetched: text !== null,
                });
                if (text) resolved.push({ id: next.opportunity_id, text });
            }
        })());
    }
    await Promise.all(workers);

    // Persist successful resolutions back to opportunities table so we don't
    // re-fetch on the next read. Fire-and-forget — failure here is non-fatal.
    if (resolved.length > 0) {
        const sb = admin();
        // Sequential writes to avoid hammering Supabase; each is fast (single-row
        // by primary key) so the total adds <100ms per resolved row.
        for (const r of resolved) {
            sb.from("opportunities")
                .update({ description: r.text, last_crawled_at: new Date().toISOString() })
                .eq("id", r.id)
                .then(() => { /* swallow */ }, () => { /* swallow */ });
        }
    }

    return out;
}
