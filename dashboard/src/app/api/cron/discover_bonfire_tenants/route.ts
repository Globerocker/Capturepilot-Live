/**
 * Bonfire tenant auto-discovery cron.
 *
 * Walks the seed list in lib/bonfire-tenant-discovery.ts, skips any slug
 * we already have in rss_sources, probes the rest against
 *   https://<slug>.bonfirehub.com/portal/
 * looking for the `organizationId = "N"` marker. Hits get inserted into
 * rss_sources with provider='bonfire', enabled=true, use_json_api=true so
 * the existing ingest_bonfire_json cron starts pulling solicitations on
 * the next tick.
 *
 * Concurrency capped at 8 — Bonfire's CF doesn't seem to mind anonymous
 * GETs to /portal/, but we don't want to flood. ~300 seeds × 0.5s each
 * with concurrency=8 = ~25s, well inside the 60s budget.
 *
 * Run via curl with CRON_SECRET or hourly via vercel.json. Idempotent —
 * re-running just re-confirms known tenants are still live.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { BONFIRE_DISCOVERY_SEEDS, probeBonfireSlug } from "@/lib/bonfire-tenant-discovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 500);
    const concurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || 8), 1), 16);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Load known bonfire prefixes from rss_sources. Slugs already with an
    // org_id get skipped; slugs WITHOUT an org_id get re-probed so any
    // blind-seeded candidates (typically added manually for missing-state
    // coverage) finally get their org_id and start fetching data.
    const { data: known, error: knownErr } = await sb
        .from("rss_sources")
        .select("source_prefix, feed_url, bonfire_org_id")
        .eq("provider", "bonfire");
    if (knownErr) return NextResponse.json({ error: knownErr.message }, { status: 500 });
    const knownSlugs = new Set<string>();
    const slugsMissingOrgId: string[] = [];
    for (const r of (known || []) as { source_prefix: string; feed_url: string; bonfire_org_id: number | null }[]) {
        let slug: string | null = null;
        // source_prefix is e.g. "bonfire-fairfaxcounty"
        if (r.source_prefix?.startsWith("bonfire-")) {
            slug = r.source_prefix.replace("bonfire-", "");
        } else {
            try {
                const h = new URL(r.feed_url).hostname.toLowerCase();
                if (h.endsWith(".bonfirehub.com")) slug = h.replace(".bonfirehub.com", "");
            } catch { /* ignore */ }
        }
        if (!slug) continue;
        knownSlugs.add(slug);
        if (!r.bonfire_org_id) slugsMissingOrgId.push(slug);
    }

    // Backfill pass — re-probe known slugs that don't have an org_id yet.
    // Runs before the new-tenant discovery so a single cron tick can both
    // fix the missing-state seeds AND discover new ones.
    const backfilled: Array<{ slug: string; organizationId: number }> = [];
    if (slugsMissingOrgId.length > 0) {
        const backfillBatch = slugsMissingOrgId.slice(0, 30); // cap so it doesn't blow the time budget
        for (let i = 0; i < backfillBatch.length; i += concurrency) {
            const slice = backfillBatch.slice(i, i + concurrency);
            await Promise.all(slice.map(async (slug) => {
                const r = await probeBonfireSlug(slug, 15_000);
                if (r.status === "found" && r.organizationId) {
                    backfilled.push({ slug, organizationId: r.organizationId });
                    await sb.from("rss_sources")
                        .update({ bonfire_org_id: r.organizationId })
                        .eq("source_prefix", `bonfire-${slug}`)
                        .is("bonfire_org_id", null);
                }
            }));
        }
    }

    const candidates = BONFIRE_DISCOVERY_SEEDS
        .filter(s => !knownSlugs.has(s.toLowerCase()))
        .slice(0, limit);

    const startedAt = Date.now();
    const found: Array<{ slug: string; organizationId: number }> = [];
    let miss = 0;
    let errored = 0;

    for (let i = 0; i < candidates.length; i += concurrency) {
        if (Date.now() - startedAt > 55_000) break;
        const slice = candidates.slice(i, i + concurrency);
        await Promise.all(slice.map(async (slug) => {
            const r = await probeBonfireSlug(slug);
            if (r.status === "found" && r.organizationId) {
                found.push({ slug, organizationId: r.organizationId });
            } else if (r.status === "error") {
                errored++;
            } else {
                miss++;
            }
        }));
    }

    // Insert new sources — let DB handle dedup via unique source_prefix.
    if (found.length > 0) {
        const rows = found.map(({ slug, organizationId }) => ({
            provider: "bonfire",
            source_prefix: `bonfire-${slug}`,
            feed_url: `https://${slug}.bonfirehub.com/opportunities/rss`,
            website: `https://${slug}.bonfirehub.com/portal/`,
            agency_name: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            agency_type: null,
            state: null,
            city: null,
            enabled: true,
            use_json_api: true,
            bonfire_org_id: organizationId,
        }));
        const { error: upErr } = await sb
            .from("rss_sources")
            .upsert(rows, { onConflict: "source_prefix", ignoreDuplicates: true });
        if (upErr) console.warn("[discover_bonfire_tenants] insert err:", upErr.message);
    }

    return NextResponse.json({
        ok: true,
        seeds_total: BONFIRE_DISCOVERY_SEEDS.length,
        already_known: knownSlugs.size,
        probed: candidates.length,
        found: found.length,
        miss,
        errored,
        new_tenants: found.map(f => `${f.slug} (orgId=${f.organizationId})`),
        backfilled_count: backfilled.length,
        backfilled: backfilled.map(b => `${b.slug} (orgId=${b.organizationId})`),
        elapsed_ms: Date.now() - startedAt,
    });
}
