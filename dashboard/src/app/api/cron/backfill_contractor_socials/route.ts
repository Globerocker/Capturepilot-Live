/**
 * Backfill social links + CMS for contractors that were QC-enriched BEFORE the
 * deterministic extractor shipped (migration 176). Those rows have
 * qc_enriched = true but social_extracted_at IS NULL.
 *
 * This does NOT re-run the full Quick Checker — just one cheap homepage fetch
 * per contractor via analyzeSiteTech (no LLM, no paid API). It targets
 * qc_enriched = true rows ONLY, so it never collides with the live QC workers
 * (which claim qc_enriched = false). Idempotent: social_extracted_at is set on
 * every processed row (even on fetch failure) so we never retry-loop a dead site.
 *
 * Guarded. Drive it from a VPS lane (or curl) at ?batch=30.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { analyzeSiteTech } from "@/lib/quick-checker/website-tech";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            try { await fn(items[idx]); } catch { /* per-item failures are non-fatal */ }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const params = new URL(req.url).searchParams;
    const batch = Math.min(60, Math.max(1, parseInt(params.get("batch") || "30", 10)));
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: rows, error } = await db
        .from("contractors")
        .select("id, website, business_url, capability_summary_ai, primary_poc_name, owner_linkedin")
        .eq("qc_enriched", true)
        .is("social_extracted_at", null)
        .or("website.not.is.null,business_url.not.is.null")
        .limit(batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, processed: 0, with_social: 0, with_cms: 0, done: true });

    let withSocial = 0, withCms = 0;
    const t0 = Date.now();
    await mapLimit(rows as any[], 8, async (c) => {
        const site: string = c.website || c.business_url;
        const patch: any = { social_extracted_at: new Date().toISOString() };
        try {
            const tech = await analyzeSiteTech(site, []);
            const so = tech.socials;
            if (so.linkedin) { patch.social_linkedin = so.linkedin; patch.company_linkedin = so.linkedin; }
            if (so.facebook) patch.social_facebook = so.facebook;
            if (so.twitter) patch.social_twitter = so.twitter;
            if (so.instagram) patch.social_instagram = so.instagram;
            if (so.youtube) patch.social_youtube = so.youtube;
            if (so.tiktok) patch.social_tiktok = so.tiktok;
            if (Object.keys(so.other).length) patch.social_other = so.other;
            if (tech.cms) { patch.website_cms = tech.cms; withCms++; }
            if (so.linkedin || so.facebook || so.twitter || so.instagram || so.youtube || so.tiktok) withSocial++;

            // owner_linkedin: an on-site /in/ profile whose slug contains the POC's full name.
            if (c.primary_poc_name && so.linkedin_people.length && !c.owner_linkedin) {
                const parts = String(c.primary_poc_name).toLowerCase().split(/\s+/).filter((p: string) => p.length > 1);
                const match = so.linkedin_people.find(u => {
                    const tail = (u.toLowerCase().split("/in/")[1] || "");
                    return parts.length >= 2 && parts.every(p => tail.includes(p));
                });
                if (match) patch.owner_linkedin = match;
            }
            if (so.linkedin_people.length) {
                patch.capability_summary_ai = { ...(c.capability_summary_ai || {}), linkedin_people: so.linkedin_people };
            }
        } catch { /* site dead/blocked — still mark extracted to avoid retry loops */ }
        await db.from("contractors").update(patch).eq("id", c.id);
    });

    return NextResponse.json({
        ok: true,
        processed: rows.length,
        with_social: withSocial,
        with_cms: withCms,
        elapsed_ms: Date.now() - t0,
    });
}
