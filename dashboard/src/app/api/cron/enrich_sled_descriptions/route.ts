/**
 * Deep-fetch missing/short SLED descriptions.
 *
 * The SLED ingest pipelines (Bonfire RSS, HigherGov aggregator, Socrata
 * datasets, LA RAMP listing call) land a row with title + agency + close
 * date but typically no real bid text. ~34% of SLED rows in our DB have
 * description < 100 chars — which means the AI summary generator has
 * nothing to chew on, and the match cards display blank scope.
 *
 * This cron walks rows where source='sled' AND length(description) < 200
 * AND link IS NOT NULL, then hits the source-specific fetcher in
 * lib/sled-description-fetcher.ts. Concurrency 4, batch limit ?limit=N
 * (default 60), so each invocation finishes well inside the 300s budget.
 *
 * Triggered by the enrichment_orchestrator on the 5-min cadence + on
 * demand via curl. Idempotent — short-description rows that the fetcher
 * can't improve are silently skipped (no description overwrite).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { fetchSledDescription } from "@/lib/sled-description-fetcher";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 60), 1), 300);
    const concurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || 4), 1), 8);
    const force = url.searchParams.get("force") === "true";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pick the next batch — short or null descriptions, has link, sled source,
    // not archived. Ordered by last_crawled_at ASC so we cycle through fairly.
    let query = sb
        .from("opportunities")
        .select("id, notice_id, title, link, description, raw_json")
        .eq("source", "sled")
        .eq("is_archived", false)
        .not("link", "is", null)
        .neq("link", "")
        .order("last_crawled_at", { ascending: true, nullsFirst: true })
        .limit(limit);
    if (!force) {
        // OR (description IS NULL, length(description) < 200). PostgREST doesn't
        // expose char_length directly so we filter client-side by fetching with
        // an over-broad cut and dropping in-process.
        query = query.or("description.is.null,description.eq.");
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = {
        id: string;
        notice_id: string | null;
        title: string | null;
        link: string | null;
        description: string | null;
        raw_json: Record<string, unknown> | null;
    };
    const candidates = (data || []) as Row[];
    // Client-side filter for non-empty but short — the OR clause above only
    // catches NULL / empty. We could push char_length into a stored function
    // later, but a 60-row scan is fine.
    const targets = force
        ? candidates
        : candidates.filter(r => !r.description || r.description.length < 200);

    if (targets.length === 0) {
        return NextResponse.json({ ok: true, scanned: 0, note: "no rows needing enrichment" });
    }

    const startedAt = Date.now();
    let enriched = 0;
    let skipped = 0;
    let failed = 0;
    const sourceCounts: Record<string, number> = {};

    for (let i = 0; i < targets.length; i += concurrency) {
        if (Date.now() - startedAt > 270_000) break;
        const slice = targets.slice(i, i + concurrency);
        await Promise.all(slice.map(async (r) => {
            if (!r.link) {
                skipped++;
                return;
            }
            // Derive source_prefix from notice_id for the skip-known-empty
            // shortcuts in the fetcher.
            const sourcePrefix = (r.notice_id || "").split("-").slice(0, 3).join("-");
            const result = await fetchSledDescription({
                link: r.link,
                title: r.title || undefined,
                rawJson: r.raw_json || undefined,
                sourcePrefix,
            }).catch(() => null);

            if (!result || !result.description || result.description.length < 50) {
                if (result?.source === "skip-known-empty") skipped++;
                else failed++;
                // Still bump last_crawled_at so we don't re-attempt the
                // same dead-end rows on every cron tick.
                await sb.from("opportunities")
                    .update({ last_crawled_at: new Date().toISOString() })
                    .eq("id", r.id);
                return;
            }

            // Guard: don't overwrite a longer existing description with a
            // shorter scraped one (avoids regressions on rows where the
            // upstream landed real bid text).
            if (r.description && r.description.length > result.description.length) {
                skipped++;
                await sb.from("opportunities")
                    .update({ last_crawled_at: new Date().toISOString() })
                    .eq("id", r.id);
                return;
            }

            const { error: upErr } = await sb.from("opportunities")
                .update({
                    description: result.description,
                    last_crawled_at: new Date().toISOString(),
                })
                .eq("id", r.id);
            if (upErr) {
                failed++;
                console.warn("[enrich_sled_descriptions] update failed", r.id, upErr.message);
                return;
            }
            enriched++;
            sourceCounts[result.source] = (sourceCounts[result.source] || 0) + 1;
        }));
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        enriched,
        skipped,
        failed,
        by_source: sourceCounts,
        elapsed_ms: Date.now() - startedAt,
    });
}
