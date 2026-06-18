/**
 * Description-derived gap-filler for opportunities.structured_requirements.
 *
 * The attachment-based path (analyze_attachments + backfill_structured_requirements
 * over attachment text) caps out around ~52% coverage — the remaining gap is
 * opportunities that have NO analyzable attachment. But many of those still carry
 * a substantial description that the SAME gpt-4o-mini JSON-mode extractor can
 * mine for scope_of_work[] / qualifications[] / deliverables[] etc.
 *
 * This cron walks rows where structured_requirements is empty/NULL/`{}`/`[]` and
 * the description is long enough to be worth a model call (>200 chars), runs the
 * existing extractStructuredRequirements() over the description text, and writes
 * the result back. While we're already holding the row, it also fills
 * extracted_keywords + keywords_extracted_at when those are still empty (reusing
 * the same extractAiKeywords() lib the keyword cron uses) so we don't make a
 * second pass over the same long tail.
 *
 * Cost is bounded by the ?limit batch (default 100, cap 500). At ~$0.0002/row
 * the full ~12.6k eligible backlog is ~$3. Operator drives via curl + CRON_SECRET
 * or it can be scheduled. Failures are logged explicitly, never silently dropped.
 *
 * Returns { ok, scanned, updated_struct, updated_keywords }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractStructuredRequirements } from "@/lib/extract-structured-requirements";
import { extractAiKeywords } from "@/lib/extract-ai-keywords";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const CONCURRENCY = 6;

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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 1), MAX_LIMIT);
    // ?order=deadline (default) walks oldest-deadline first so we enrich the
    // opps closest to closing; ?order=recent walks newest-ingested first.
    const order = url.searchParams.get("order") === "recent" ? "recent" : "deadline";

    const sb = db();

    // Eligible: empty/NULL structured_requirements + a description long enough
    // to be worth a model call + not archived. The OR over the empty-JSON forms
    // mirrors the baseline COUNT used to size this backfill (~12.6k rows).
    let query = sb
        .from("opportunities")
        .select("id, title, description, structured_requirements, extracted_keywords, keywords_extracted_at")
        .eq("is_archived", false)
        .or("structured_requirements.is.null,structured_requirements.eq.{},structured_requirements.eq.null,structured_requirements.eq.[]")
        .limit(limit);

    if (order === "deadline") {
        // Oldest deadline first; NULLs last so dated rows win.
        query = query.order("response_deadline", { ascending: true, nullsFirst: false });
    } else {
        query = query.order("created_at", { ascending: false, nullsFirst: false });
    }

    const { data, error } = await query;
    if (error) {
        const code = (error as { code?: string }).code;
        return NextResponse.json({ error: error.message, code }, { status: 500 });
    }

    type Row = {
        id: string;
        title: string | null;
        description: string | null;
        structured_requirements: unknown;
        extracted_keywords: string[] | null;
        keywords_extracted_at: string | null;
    };

    // The Supabase `.or()` over JSON columns can't reliably express the
    // length(description) > 200 guard, so enforce it here. Rows that slip
    // through with a short/empty description are skipped (scanned but not
    // updated) to avoid burning a model call on nothing.
    const targets = ((data || []) as Row[]).filter(
        (r) => (r.description || "").trim().length > 200,
    );

    if (targets.length === 0) {
        return NextResponse.json({
            ok: true,
            scanned: (data || []).length,
            updated_struct: 0,
            updated_keywords: 0,
            note: "no eligible rows (description>200 + empty struct_reqs)",
        });
    }

    const startedAt = Date.now();
    let updatedStruct = 0;
    let updatedKeywords = 0;
    let structFailures = 0;
    let keywordFailures = 0;

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        // Budget guard — leave headroom under the 300s ceiling.
        if (Date.now() - startedAt > 270_000) break;
        const slice = targets.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (r) => {
            const update: Record<string, unknown> = {};

            // 1) structured_requirements from the description text.
            try {
                const sr = await extractStructuredRequirements({
                    title: r.title,
                    description: r.description,
                });
                if (sr) {
                    update.structured_requirements = sr;
                } else {
                    structFailures++;
                }
            } catch (e) {
                structFailures++;
                console.warn(
                    "[backfill_requirements_from_description] struct extract failed",
                    r.id,
                    e instanceof Error ? e.message : String(e),
                );
            }

            // 2) keywords — only when this row never had them extracted. Most
            // rows already do (corpus-wide keyword backfill is ~done), so this
            // is just mopping up the long tail while we're here.
            const needKeywords =
                !r.keywords_extracted_at &&
                (!r.extracted_keywords || r.extracted_keywords.length === 0);
            if (needKeywords) {
                try {
                    const kw = await extractAiKeywords({
                        title: r.title,
                        description: r.description,
                    });
                    // Stamp keywords_extracted_at regardless so we don't re-loop
                    // this row; write the keyword model + array when we got any.
                    update.keywords_extracted_at = new Date().toISOString();
                    update.keywords_extraction_model = kw?.model || null;
                    if (kw && kw.keywords.length > 0) {
                        update.extracted_keywords = kw.keywords;
                    } else {
                        update.extracted_keywords = null;
                        if (!kw) keywordFailures++;
                    }
                } catch (e) {
                    keywordFailures++;
                    console.warn(
                        "[backfill_requirements_from_description] keyword extract failed",
                        r.id,
                        e instanceof Error ? e.message : String(e),
                    );
                }
            }

            if (Object.keys(update).length === 0) return;

            const { error: upErr } = await sb
                .from("opportunities")
                .update(update)
                .eq("id", r.id);
            if (upErr) {
                console.warn(
                    "[backfill_requirements_from_description] update failed",
                    r.id,
                    upErr.message,
                );
                return;
            }
            if ("structured_requirements" in update) updatedStruct++;
            if ("extracted_keywords" in update && update.extracted_keywords) updatedKeywords++;
        }));
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        updated_struct: updatedStruct,
        updated_keywords: updatedKeywords,
        struct_failures: structFailures,
        keyword_failures: keywordFailures,
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/backfill_requirements_from_description", GET_handler);
