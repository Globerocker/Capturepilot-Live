/**
 * SLED link-validator cron.
 *
 * Background: SLED opportunity URLs go stale. Bonfire rotates project_ids
 * after archival, OpenGov hides closed projects, RSS sources sometimes
 * change feed structure mid-stream. We need a way to flag known-broken
 * links so the frontend doesn't show a dead button.
 *
 * Strategy: HEAD-request each SLED link with a short timeout, mark
 * link_broken=true on 404/410, update link_last_checked_at. Rotate the work
 * — never re-check more often than weekly per row, so we cycle through the
 * full set every ~3-4 days at the current 500-row-per-run cap.
 *
 * Why not validate at ingest time: Bonfire JSON returns 200 on every
 * project URL even if the listing has been archived (CF challenge or
 * generic landing page returned). Validation is meaningful only when paired
 * with the rendered-page check, which we delegate to the playwright worker
 * via a separate task type if HEAD returns ambiguous.
 *
 * Runs daily at 03:00 UTC (off-peak for most US portal CDNs).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = Number(process.env.LINK_VALIDATE_BATCH || 500);
const CONCURRENCY = 12;
const TIMEOUT_MS = 8_000;
const RECHECK_AFTER_DAYS = 7;

interface OppRow {
    id: string;
    link: string;
    link_last_checked_at: string | null;
}

async function checkOne(url: string): Promise<{ ok: boolean; broken: boolean; status: number | null }> {
    try {
        // HEAD first — cheaper, most portals respond
        const res = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404 || res.status === 410) return { ok: false, broken: true, status: res.status };
        if (res.status === 405) {
            // HEAD not allowed; fall through to GET
        } else {
            // 2xx, 3xx (followed), or 401/403/5xx — treat anything but 4xx-not-found as "alive enough"
            return { ok: true, broken: false, status: res.status };
        }
    } catch {
        // Network/timeout — don't mark broken on transient errors. Try GET.
    }
    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404 || res.status === 410) return { ok: false, broken: true, status: res.status };
        return { ok: true, broken: false, status: res.status };
    } catch {
        return { ok: false, broken: false, status: null };
    }
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const recheckCutoff = new Date(Date.now() - RECHECK_AFTER_DAYS * 86_400_000).toISOString();

    // Pull never-checked + oldest-checked first. The partial index from
    // migration 099 (idx_opportunities_link_check) makes this fast.
    const { data, error } = await sb
        .from("opportunities")
        .select("id, link, link_last_checked_at")
        .eq("source", "sled")
        .eq("is_archived", false)
        .not("link", "is", null)
        .or(`link_last_checked_at.is.null,link_last_checked_at.lt.${recheckCutoff}`)
        .order("link_last_checked_at", { ascending: true, nullsFirst: true })
        .limit(BATCH);

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data || []) as OppRow[];
    const stats = { checked: 0, broken: 0, alive: 0, transient: 0 };
    const now = new Date().toISOString();

    // Process in parallel chunks so 500 checks finish in ~ (500/12)*1s = 40s.
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(chunk.map(r => checkOne(r.link)));
        for (let j = 0; j < chunk.length; j++) {
            const r = chunk[j];
            const out = results[j];
            stats.checked += 1;
            if (out.status !== "fulfilled") { stats.transient += 1; continue; }
            const { broken, ok } = out.value;
            if (broken) stats.broken += 1;
            else if (ok) stats.alive += 1;
            else stats.transient += 1;
            await sb.from("opportunities")
                .update({
                    link_broken: broken,
                    link_last_checked_at: now,
                })
                .eq("id", r.id);
        }
    }

    return NextResponse.json({ ok: true, stats });
}
