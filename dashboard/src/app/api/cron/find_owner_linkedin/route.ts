/**
 * Owner/CEO LinkedIn finder — fills contractors.owner_linkedin for QC-enriched
 * contractors whose site didn't link the owner's personal profile. Resolves the
 * public profile URL via DuckDuckGo HTML search (free, keyless) with strict
 * name-matching (see lib/quick-checker/find-linkedin.ts). Marks
 * owner_linkedin_searched_at on every processed row (found or not) so we never
 * re-search the same contractor.
 *
 * Conservative pacing (low concurrency + per-item delay) so we don't trip DDG's
 * rate limiting. Guarded. Drive from a VPS lane at ?batch=6.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { findOwnerLinkedIn } from "@/lib/quick-checker/find-linkedin";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const params = new URL(req.url).searchParams;
    const batch = Math.min(15, Math.max(1, parseInt(params.get("batch") || "6", 10)));
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: rows, error } = await db
        .from("contractors")
        .select("id, company_name, primary_poc_name")
        .eq("qc_enriched", true)
        .is("owner_linkedin", null)
        .is("owner_linkedin_searched_at", null)
        .not("primary_poc_name", "is", null)
        .limit(batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, processed: 0, found: 0, done: true });

    let found = 0;
    const t0 = Date.now();
    // Sequential + per-item delay — DDG rate-limits aggressive parallel hits.
    for (const c of rows as any[]) {
        const patch: any = { owner_linkedin_searched_at: new Date().toISOString() };
        try {
            const r = await findOwnerLinkedIn(c.primary_poc_name, c.company_name);
            if (r) { patch.owner_linkedin = r.url; found++; }
        } catch { /* non-fatal */ }
        await db.from("contractors").update(patch).eq("id", c.id);
        await sleep(2000);
    }

    return NextResponse.json({ ok: true, processed: rows.length, found, elapsed_ms: Date.now() - t0 });
}
