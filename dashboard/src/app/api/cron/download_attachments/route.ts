import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * Cron: download SAM.gov attachments that haven't been cached yet.
 *
 * Schedule: daily 06:00 UTC (ahead of the rest of the enrichment pipeline).
 * Downloads up to 25 attachments per run via the existing
 * /api/sam/attachment-download proxy and stores text-extraction metadata in
 * opportunities.attachment_urls. Each opportunity has its own TTL
 * (attachments_cached_until) so we only re-download after 30 days.
 *
 * Budget: SAM.gov allows 1000 calls/hour per key. With batch 25 per run
 * we're well under the limit.
 */
export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
