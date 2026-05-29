/**
 * Contractor-profile backlink prospect discovery.
 *
 * For every published contractor_profile_page where the contractor has
 * (a) a Federal Score ≥ 60, AND (b) company_website + Apollo-enriched
 * email/contact, we create a backlink_prospect with:
 *   - link_target_url = the contractor's profile page (so they see
 *     EXACTLY where we're featuring them, not a generic CapturePilot page)
 *   - pitch_angle = "contractor_profile" — tells the drafter to use the
 *     "you're featured, please link back" template
 *   - link_anchor_suggestion = the contractor's business name
 *
 * Idempotent — dedupes by domain so existing backlink_prospects rows
 * (from competitor-refdomain discovery) get a NEW pitch_angle slot
 * rather than a duplicate prospect.
 *
 * Strategy: this turns the contractor directory into a backlink
 * acquisition engine. Each profile page is a piece of free PR for the
 * contractor; the trade is they link back to us (high-DR contextual link
 * from a real US business site = great for SEO).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 25;
const MIN_SCORE = 60;

function domainFromUrl(raw: string | null): string | null {
    if (!raw) return null;
    try {
        const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch { return null; }
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull top candidates that don't yet have a contractor_profile prospect.
    // is_published + has website + score ≥ MIN_SCORE is the bar.
    const { data: candidates, error } = await sb
        .from("contractor_profile_pages")
        .select("contractor_uei, slug, business_name, company_website, federal_score, primary_naics, state, top_agency")
        .eq("is_published", true)
        .gte("federal_score", MIN_SCORE)
        .not("company_website", "is", null)
        .order("federal_score", { ascending: false })
        .limit(BATCH * 3); // overfetch since many will be skipped (no domain / already-prospected)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const stats = { candidates: candidates?.length || 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
    let processed = 0;

    for (const c of (candidates || [])) {
        if (processed >= BATCH) break;
        const domain = domainFromUrl(c.company_website);
        if (!domain) { stats.skipped += 1; continue; }

        // Check existing prospect for this domain
        const { data: existing } = await sb
            .from("backlink_prospects")
            .select("id, pitch_angle, link_target_url")
            .eq("domain", domain)
            .maybeSingle();

        const link_target_url = `https://www.capturepilot.com/contractors/${c.slug}`;
        const link_anchor_suggestion = c.business_name;
        const pitch_angle = "contractor_profile";
        const rationale = `Federal Score ${c.federal_score}/100 · ${c.primary_naics ? `NAICS ${c.primary_naics} · ` : ""}${c.state || ""}${c.top_agency ? ` · top agency ${c.top_agency}` : ""}`;

        try {
            if (existing) {
                // Already a prospect — UPGRADE it to also point at the
                // contractor profile if it wasn't already (their original
                // pitch_angle stays, but the target URL becomes the
                // contractor profile since that's the most specific link
                // they care about).
                if (existing.pitch_angle === "contractor_profile") {
                    stats.skipped += 1;
                    continue;
                }
                await sb.from("backlink_prospects")
                    .update({
                        pitch_angle: "contractor_profile",
                        link_target_url,
                        link_anchor_suggestion,
                        rationale,
                    })
                    .eq("id", existing.id);
                stats.updated += 1;
            } else {
                await sb.from("backlink_prospects").insert({
                    domain,
                    status: "discovered",
                    tier: 3, // contractor-website tier — lower than press/editorial
                    category: "contractor_profile",
                    pitch_angle: "contractor_profile",
                    link_target_url,
                    link_anchor_suggestion,
                    rationale,
                });
                stats.inserted += 1;
            }
            processed += 1;
        } catch (e) {
            console.warn("[discover_contractor_backlink_prospects]", domain, (e as Error).message);
            stats.errors += 1;
        }
    }

    return NextResponse.json({ ok: true, stats });
}
