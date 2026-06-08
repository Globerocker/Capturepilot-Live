/**
 * AI keyword extraction batch cron.
 *
 * Pulls up to N opportunities where `keywords_extracted_at IS NULL` AND
 * description IS NOT NULL, runs each through the gpt-4o-mini extractor
 * in parallel (CONCURRENCY = 8), writes the resulting keywords back.
 *
 * Scheduled to run hourly. Each run processes ~300 rows in well under the
 * 300s budget at concurrency 8 (avg ~1.5s per row × 300 / 8 ≈ 56s wall
 * time). At ~30k pending rows the backfill self-completes in ~100 hours
 * (4 days) — or the operator can hit the endpoint manually with limit=500
 * to drain faster.
 *
 * Idempotent: rows with keywords_extracted_at SET are skipped automatically.
 * To re-extract a row, NULL out `keywords_extracted_at`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractAiKeywords } from "@/lib/extract-ai-keywords";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_LIMIT = 300;
const CONCURRENCY = 8;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 1), 1000);
    // Optional ?reextract=true: ignore the keywords_extracted_at filter so we
    // can rerun against rows that previously got a model upgrade.
    const reextract = url.searchParams.get("reextract") === "true";

    const sb = db();

    let query = sb
        .from("opportunities")
        .select("id, title, description")
        .not("description", "is", null)
        .limit(limit);
    if (!reextract) {
        query = query.is("keywords_extracted_at", null);
    }

    const { data: rows, error } = await query;
    if (error) {
        const code = (error as { code?: string }).code;
        return NextResponse.json({ error: error.message, code }, { status: 500 });
    }

    type Row = { id: string; title: string | null; description: string | null };
    const targets = (rows || []) as Row[];

    if (targets.length === 0) {
        return NextResponse.json({ ok: true, scanned: 0, note: "no pending rows" });
    }

    const startedAt = Date.now();
    let writtenWithKeywords = 0;
    let writtenEmpty = 0;
    let aiFailures = 0;
    const modelCounts: Record<string, number> = {};

    // Parallelize in fixed-size chunks. Each row hits the AI provider then
    // writes back one Supabase UPDATE — ~1-2s per row. Concurrency of 8
    // keeps us inside both Supabase pool limits and provider RPM caps.
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const slice = targets.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (r) => {
            const result = await extractAiKeywords({
                title: r.title,
                description: r.description,
            });
            const update: Record<string, unknown> = {
                keywords_extracted_at: new Date().toISOString(),
                keywords_extraction_model: result?.model || null,
            };
            if (result && result.keywords.length > 0) {
                update.extracted_keywords = result.keywords;
                writtenWithKeywords++;
                modelCounts[result.model] = (modelCounts[result.model] || 0) + 1;
            } else {
                // Mark the row as processed (extracted_at set) even when the AI
                // returned nothing — prevents a re-loop hammering the same row.
                // Caller can manually NULL out keywords_extracted_at to retry.
                update.extracted_keywords = null;
                if (!result) aiFailures++;
                else writtenEmpty++;
            }
            const { error: upErr } = await sb
                .from("opportunities")
                .update(update)
                .eq("id", r.id);
            if (upErr) {
                console.warn("[extract_keywords_batch] update failed", r.id, upErr.message);
            }
        }));
        // Budget guard — bail out if we're past 250s with rows still left.
        if (Date.now() - startedAt > 250_000) break;
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        with_keywords: writtenWithKeywords,
        empty: writtenEmpty,
        ai_failures: aiFailures,
        by_model: modelCounts,
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/extract_keywords_batch", GET_handler);
