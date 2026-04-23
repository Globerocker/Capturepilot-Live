import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractStructuredRequirements } from "@/lib/extract-requirements";

export const maxDuration = 300;

/**
 * High-frequency backfill: fetches solicitation description text from SAM.gov
 * for opportunities that still carry a `https://api.sam.gov/...` URL in
 * the description column. Free (no LLM). Runs every 15 min via vercel.json.
 *
 * Priority order:
 *   1) Opportunities referenced by HOT / WARM user_matches (what users see first)
 *   2) Rest by posted_date desc
 *
 * Per-run budget: 50 opps. ~5-10s each due to SAM.gov rate limits.
 * 4 runs/hour * 50 = 200/hour => 10,856 backlog cleared in ~55 hours.
 */
const BATCH_SIZE = 50;
const SAM_API_KEY = process.env.SAM_API_KEY || "";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    // Accept either Vercel's CRON_SECRET bearer OR the Supabase service key
    // (so Supabase pg_cron can trigger this directly when Vercel's scheduler
    // fails to register). Neither exposes user data — the route only mutates
    // public SAM.gov opportunity rows.
    const auth = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = serviceKey ? `Bearer ${serviceKey}` : null;
    if ((expectedCron || expectedSvc) && auth !== expectedCron && auth !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!SAM_API_KEY) {
        return NextResponse.json({ error: "SAM_API_KEY not configured" }, { status: 500 });
    }

    const db = admin();
    const startTime = Date.now();
    const stats = { fetched: 0, failed: 0, skipped_short: 0, skipped_403: 0 };

    // Collect priority HOT/WARM opp IDs first
    const { data: priorityMatches } = await db
        .from("user_matches")
        .select("opportunity_id")
        .in("classification", ["HOT", "WARM"])
        .limit(200);
    const priorityIds = new Set<string>((priorityMatches || []).map((m: { opportunity_id: string }) => m.opportunity_id));

    // Pull candidates: URL descriptions, prefer priority then recent
    const { data: candidates } = await db
        .from("opportunities")
        .select("id, notice_id, description")
        .eq("is_archived", false)
        .like("description", "https://api.sam.gov%")
        .order("posted_date", { ascending: false, nullsFirst: false })
        .limit(BATCH_SIZE * 3);

    const rows = (candidates || []) as Array<{ id: string; notice_id: string; description: string }>;
    const sorted = rows.sort((a, b) => (priorityIds.has(b.id) ? 1 : 0) - (priorityIds.has(a.id) ? 1 : 0));
    const targets = sorted.slice(0, BATCH_SIZE);

    if (targets.length === 0) {
        return NextResponse.json({ success: true, message: "No URL-descriptions left", ...stats });
    }

    for (const opp of targets) {
        if (Date.now() - startTime > 270_000) break;
        try {
            const r = await fetch(opp.description, {
                headers: { "X-Api-Key": SAM_API_KEY, Accept: "application/json" },
                signal: AbortSignal.timeout(20_000),
            });
            if (r.status === 403 || r.status === 429) {
                stats.skipped_403++;
                continue;
            }
            if (!r.ok) {
                stats.failed++;
                continue;
            }
            // SAM's /v1/noticedesc returns JSON `{"description":"<HTML or plain>"}`.
            // Extract the inner string, then strip any HTML tags from it.
            const raw = await r.text();
            let innerText = raw;
            try {
                const parsed = JSON.parse(raw) as { description?: string };
                if (typeof parsed?.description === "string") {
                    innerText = parsed.description;
                }
            } catch {
                // Not JSON — use raw body as-is and let the tag-strip handle it.
            }
            const text = innerText.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 12_000);
            if (text.length < 100) {
                stats.skipped_short++;
                continue;
            }
            const reqs = extractStructuredRequirements(text);
            await db
                .from("opportunities")
                .update({
                    description: text,
                    structured_requirements: reqs,
                    last_crawled_at: new Date().toISOString(),
                })
                .eq("id", opp.id);
            stats.fetched++;
        } catch {
            stats.failed++;
        }
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
}
