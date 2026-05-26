/**
 * Bulk backfill — populates worker_jobs with work for every under-enriched
 * opportunity AND every known portal that needs a Cloudflare-clearance
 * cookie. Designed to be called once after migration 086 lands, then
 * occasionally to top up the queue for any stragglers.
 *
 * What it enqueues:
 *   - classify_naics for every opp with NULL naics_code
 *   - extract_structured_reqs for every opp where the field is null or
 *     null-heavy
 *   - scrape_portal_detail for every SLED opp with description < 200 chars
 *     and link on a known-SPA host
 *   - warm_cf_cookie for every Bonfire host we currently ingest
 *
 * Uses ON CONFLICT DO NOTHING via the dedup_key index on worker_jobs so it's
 * safe to re-run — only fresh work gets queued.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const SPA_HOST_FRAGMENTS = [
    ".bonfirehub.com",
    "procurement.opengov.com",
    "txsmartbuy.gov",
    "evp.nc.gov",
    "emma.maryland.gov",
    ".cleveland.gov",
    ".clevelandohio.gov",
    "sigma.michigan.gov",
    "caleprocure.ca.gov",
];

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const opLimit = Math.min(Math.max(Number(url.searchParams.get("op_limit") || 5000), 100), 20000);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const startedAt = Date.now();
    const counts: Record<string, number> = {};

    // ---- 1. classify_naics — opps with no NAICS code ----
    {
        const { data, error } = await sb.from("opportunities")
            .select("id")
            .eq("is_archived", false)
            .is("naics_code", null)
            .limit(opLimit);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const rows = (data || []).map(r => ({
            task_type: "classify_naics",
            payload: { opp_id: r.id },
            priority: 6,
        }));
        if (rows.length > 0) {
            const { error: insErr } = await sb.from("worker_jobs").insert(rows);
            counts.classify_naics_inserted = insErr ? 0 : rows.length;
            if (insErr && !/dedup_key/.test(insErr.message)) {
                console.warn("[enqueue_backfill] classify_naics err:", insErr.message);
            }
        }
    }

    // ---- 2. extract_structured_reqs — opps where structured_requirements is null ----
    {
        const { data, error } = await sb.from("opportunities")
            .select("id")
            .eq("is_archived", false)
            .is("structured_requirements", null)
            .not("description", "is", null)
            .limit(opLimit);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const rows = (data || []).map(r => ({
            task_type: "extract_structured_reqs",
            payload: { opp_id: r.id },
            priority: 5,
        }));
        if (rows.length > 0) {
            await sb.from("worker_jobs").insert(rows).then(({ error: insErr }) => {
                counts.extract_structured_reqs_inserted = insErr ? 0 : rows.length;
            });
        }
    }

    // ---- 3. scrape_portal_detail — SLED rows with thin desc on SPA hosts ----
    {
        // SQL function from migration 085 handles char_length filter
        const { data, error } = await sb.rpc("get_sled_rows_needing_enrichment", {
            host_patterns: SPA_HOST_FRAGMENTS.map(h => `%${h}%`),
            max_desc_len: 300,
            batch_size: Math.min(opLimit, 2000),
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const rows = ((data || []) as Array<{ id: string; link: string }>).map(r => ({
            task_type: "scrape_portal_detail",
            payload: { opp_id: r.id, url: r.link },
            priority: 4,
        }));
        if (rows.length > 0) {
            await sb.from("worker_jobs").insert(rows).then(({ error: insErr }) => {
                counts.scrape_portal_detail_inserted = insErr ? 0 : rows.length;
            });
        }
    }

    // ---- 4. warm_cf_cookie — every Bonfire host we know about ----
    {
        const { data, error } = await sb.from("rss_sources")
            .select("feed_url")
            .eq("provider", "bonfire")
            .eq("enabled", true);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const hosts = new Set<string>();
        for (const r of (data || []) as { feed_url: string }[]) {
            try {
                const h = new URL(r.feed_url).hostname.toLowerCase();
                if (h.endsWith(".bonfirehub.com")) hosts.add(h);
            } catch { /* skip */ }
        }
        const rows = Array.from(hosts).map(host => ({
            task_type: "warm_cf_cookie",
            payload: { host },
            priority: 8,  // High — these unblock downstream scrape jobs
        }));
        if (rows.length > 0) {
            await sb.from("worker_jobs").insert(rows).then(({ error: insErr }) => {
                counts.warm_cf_cookie_inserted = insErr ? 0 : rows.length;
            });
        }
    }

    // ---- 5. Pending queue summary ----
    const { data: queueSnapshot } = await sb.from("worker_jobs")
        .select("task_type, status")
        .eq("status", "pending");
    const pending: Record<string, number> = {};
    for (const j of (queueSnapshot || []) as { task_type: string }[]) {
        pending[j.task_type] = (pending[j.task_type] || 0) + 1;
    }

    return NextResponse.json({
        ok: true,
        counts,
        pending_queue: pending,
        elapsed_ms: Date.now() - startedAt,
    });
}
