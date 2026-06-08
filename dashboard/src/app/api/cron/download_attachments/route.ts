import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

/**
 * Cron: attachment DISCOVERY (not download).
 *
 * NB: misleading historical name. This cron does NOT download PDFs and does
 * NOT extract text. It only:
 *   1. Copies `resource_links` (populated at ingest by ingest_sam) into the
 *      separate `attachment_urls` column.
 *   2. Sets `attachments_cached_until` to now + 30d as a discovery TTL.
 *
 * The actual heavy lifting — PDF download, OCR/text extraction, LLM analysis,
 * writing `structured_requirements` / `ai_win_strategy` — lives in:
 *   worker_jobs `analyze_attachments` handler in /api/cron/run_worker_jobs
 *     (per-opp, claimed off the queue; replaced the batched
 *     /api/cron/analyze_match_attachments route on 2026-06-08).
 *   /api/cron/deep_enrich                (description text re-fetch)
 *
 * If you're looking for "where do PDFs actually get processed?" — it's the
 * `analyze_attachments` queue task in run_worker_jobs, NOT this file.
 *
 * Schedule: daily 11:00 UTC. Budget: trivially under SAM's 1000 calls/hour
 * quota (no SAM calls at all — pure DB shuffle).
 */
async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const samKey = process.env.SAM_API_KEY;
    if (!samKey) return NextResponse.json({ error: "SAM_API_KEY missing" }, { status: 500 });

    const batchSize = parseInt(req.nextUrl.searchParams.get("limit") || "150", 10);

    // Target: active opportunities with resource_links set AND attachment_urls
    // null/empty AND (attachments_cached_until < now OR null).
    const nowIso = new Date().toISOString();
    const { data: targets } = await admin
        .from("opportunities")
        .select("id, notice_id, title, resource_links, attachments_cached_until")
        .eq("is_archived", false)
        .in("status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH"])
        .not("resource_links", "is", null)
        .or(`attachments_cached_until.is.null,attachments_cached_until.lt.${nowIso}`)
        .order("posted_date", { ascending: false })
        .limit(batchSize);

    const rows = (targets || []) as Array<{ id: string; notice_id: string; title: string; resource_links: string[] | null }>;
    if (rows.length === 0) {
        return NextResponse.json({ processed: 0, note: "no opportunities need attachments" });
    }

    // The actual download + text extraction lives inside /api/sam/attachment-download
    // and is tied to each attachment URL. Here we just mark each opp as
    // "cached" and record its attachment_urls list so the deep_enrich cron
    // knows what to analyze. We intentionally do NOT re-run the heavy text
    // extraction here — that's deep_enrich's job. This cron is about
    // attachment discovery and linking, not content extraction.

    const stats = { processed: 0, errors: 0 };
    const refreshAfter = new Date(Date.now() + 30 * 86400_000).toISOString();

    for (const opp of rows) {
        try {
            // resource_links comes from SAM.gov as the list of attachment URLs;
            // it's already populated by ingest. Our job here is just to record
            // that we've acknowledged them so deep_enrich picks them up.
            const links = Array.isArray(opp.resource_links) ? opp.resource_links : [];

            await admin.from("opportunities")
                .update({
                    attachment_urls: links,
                    attachments_cached_until: refreshAfter,
                })
                .eq("id", opp.id);
            stats.processed++;
        } catch {
            stats.errors++;
        }
    }

    return NextResponse.json({ ...stats, batch: rows.length });
}

export const GET = withCronTelemetry("/api/cron/download_attachments", GET_handler);
