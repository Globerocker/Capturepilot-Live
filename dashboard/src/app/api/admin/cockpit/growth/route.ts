/**
 * GET /api/admin/cockpit/growth?contractor_id=ID[&refresh=1]
 *
 * The Sales Cockpit "Growth" tab engine. Builds a per-contractor growth-gap
 * roadmap in two layers:
 *   Layer 1 — DATA GAPS: what's missing/weak we can fix (no website, no past
 *     performance, lapsed/expiring SAM, no LinkedIn, thin keywords, …). Reuses
 *     computeDataGaps() + a few cockpit-only signals.
 *   Layer 2 — GROWTH LEVERS with live-opportunity counts:
 *     (a) cert-unlock   — how many more live opps a set-aside would open
 *         (generateCertRecommendations).
 *     (b) adjacent-NAICS — opps in NAICS in the same 3-digit subsector the firm
 *         doesn't already list (counted from a bounded opp scan).
 *     (c) geo expansion — opps in nearby states (suggestGeoExpansion).
 * Plus a single sharp `email_hook` line the rep can drop into outreach.
 *
 * The heavy NAICS-scoped opp scan is cached on contractors.growth_roadmap for
 * 24h (migration 188); ?refresh=1 forces a recompute.
 *
 * Admin-gated. Counts are directional (the opp scan is row-capped) — the UI
 * frames them as "≈" so they read as a floor, not a contract.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { computeDataGaps } from "@/lib/outreach/match-drop";
import { generateCertRecommendations, type CertRecommendation } from "@/lib/cert-recommendations";
import { suggestGeoExpansion, type GeoExpansionResult } from "@/lib/quick-checker/geo-expansion";
import { getNaicsDescription } from "@/lib/naics-labels";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OPP_SCAN_CAP = 8000; // bounded NAICS-scoped scan; counts are directional
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface GapItem { key: string; hook: string }
interface AdjacentNaics { code: string; label: string; opp_count: number }
interface GrowthRoadmap {
    data_gaps: GapItem[];
    cert_unlock: CertRecommendation[];
    adjacent_naics: AdjacentNaics[];
    geo_expansion: GeoExpansionResult;
    email_hook: string | null;
    computed_at: string;
}

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

const CONTRACTOR_COLS =
    "id, company_name, naics_codes, certifications, sba_certifications, state, " +
    "website, business_url, email, primary_poc_email, " +
    "expiration_date, registration_status, sam_registration_date, " +
    "owner_linkedin, social_linkedin, company_linkedin, " +
    "capability_keywords, capability_summary_ai, years_in_business, growth_roadmap";

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sp = req.nextUrl.searchParams;
    const contractorId = (sp.get("contractor_id") || "").trim();
    const refresh = sp.get("refresh") === "1";
    if (!contractorId) {
        return NextResponse.json({ ok: false, error: "contractor_id required" }, { status: 400 });
    }

    const sb = svc();
    const { data, error } = await sb
        .from("contractors")
        .select(CONTRACTOR_COLS)
        .eq("id", contractorId)
        .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "contractor not found" }, { status: 404 });
    const c = data as any;

    // ── Freshness gate ───────────────────────────────────────────────────────
    const cached = (c.growth_roadmap || null) as GrowthRoadmap | null;
    if (!refresh && cached?.computed_at) {
        const age = Date.now() - new Date(cached.computed_at).getTime();
        if (Number.isFinite(age) && age < CACHE_TTL_MS) {
            return NextResponse.json({ ok: true, roadmap: cached, cached: true });
        }
    }

    const userNaics = toStrArray(c.naics_codes).slice(0, 5);
    const userCerts = [...toStrArray(c.certifications), ...toStrArray(c.sba_certifications)];
    const homeState = (c.state || "").trim();
    const blob = (c.capability_summary_ai || {}) as any;

    // ── Bounded NAICS-scoped opp scan (by 3-digit subsector — broad enough to
    //    catch adjacent codes; row-capped so it never blows the function) ──────
    const subsectors3 = Array.from(new Set(userNaics.map((n) => n.replace(/\D/g, "").slice(0, 3)).filter((s) => s.length === 3)));
    let allOpps: Array<{ id: string; naics_code: string | null; set_aside_code: string | null; agency: string | null; title: string | null; award_amount: number | null; response_deadline: string | null }> = [];
    if (subsectors3.length) {
        const orFilter = subsectors3.map((s) => `naics_code.like.${s}*`).join(",");
        let offset = 0;
        const PAGE = 1000;
        while (allOpps.length < OPP_SCAN_CAP) {
            const { data, error: oppErr } = await sb
                .from("opportunities")
                .select("id, naics_code, set_aside_code, agency, title, award_amount, response_deadline")
                .eq("is_archived", false)
                .or(orFilter)
                .range(offset, offset + PAGE - 1);
            if (oppErr) { console.warn("[cockpit/growth] opp scan error:", oppErr.message); break; }
            if (!data || data.length === 0) break;
            allOpps.push(...(data as any[]));
            if (data.length < PAGE) break;
            offset += PAGE;
        }
    }

    // ── Layer 2a — cert-unlock (engine filters to the user's 4-digit NAICS) ───
    const cert_unlock = generateCertRecommendations(userCerts, allOpps as any, userNaics).slice(0, 4);

    // ── Layer 2b — adjacent NAICS: codes in the user's 3-digit subsector(s) the
    //    firm doesn't already list, ranked by live-opp count ───────────────────
    const userExact = new Set(userNaics.map((n) => n.replace(/\D/g, "")));
    const adjCounts = new Map<string, number>();
    for (const o of allOpps) {
        const code = (o.naics_code || "").replace(/\D/g, "");
        if (code.length < 6) continue;
        if (userExact.has(code)) continue;
        adjCounts.set(code, (adjCounts.get(code) || 0) + 1);
    }
    const adjacent_naics: AdjacentNaics[] = Array.from(adjCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, opp_count]) => ({ code, label: getNaicsDescription(code), opp_count }));

    // ── Layer 2c — geo expansion (its own bounded scan) ───────────────────────
    let geo_expansion: GeoExpansionResult = { total_potential_opps: 0, suggestions: [], summary: "" };
    try {
        geo_expansion = await suggestGeoExpansion(sb, userNaics, homeState ? [homeState] : []);
    } catch (e) {
        console.warn("[cockpit/growth] geo expansion failed:", e instanceof Error ? e.message : String(e));
    }

    // ── Layer 1 — data gaps (computeDataGaps + cockpit-only signals) ──────────
    const { gaps: baseGaps } = computeDataGaps(blob, c);
    const data_gaps: GapItem[] = baseGaps.map((g) => ({ key: g.key, hook: g.hook }));
    const augment = (key: string, hook: string) => {
        if (!data_gaps.some((g) => g.key === key)) data_gaps.push({ key, hook });
    };
    const hasWebsite = !!(c.website || c.business_url);
    const hasLinkedin = !!(c.owner_linkedin || c.social_linkedin || c.company_linkedin);
    const kwCount = toStrArray(c.capability_keywords).length;
    const expMs = c.expiration_date ? new Date(c.expiration_date).getTime() : NaN;
    const daysToExpiry = Number.isFinite(expMs) ? Math.round((expMs - Date.now()) / 86_400_000) : null;
    if (!hasWebsite) augment("no_website", "we couldn't find a website for them — buyers Google a vendor before they call");
    if (daysToExpiry != null && daysToExpiry < 0) augment("sam_lapsed", "their SAM.gov registration has lapsed — they can't win a federal award until it's active again");
    else if (daysToExpiry != null && daysToExpiry <= 60) augment("sam_expiring", `their SAM.gov registration expires in ${daysToExpiry} days — renew before it lapses`);
    if (!hasLinkedin) augment("no_linkedin", "no LinkedIn on file — harder to verify the team and warm up the relationship");
    if (kwCount < 3) augment("thin_keywords", "we have only a thin read on what they actually do — a richer profile sharpens their matches");

    // ── email_hook — the single sharpest line ─────────────────────────────────
    const topCert = cert_unlock[0];
    let email_hook: string | null = null;
    if (topCert && topCert.unlocked_count > 0) {
        email_hook = `Getting ${topCert.cert_label} would put roughly ${topCert.unlocked_count} more live opportunities in your lane that are set aside right now.`;
    } else if (geo_expansion.total_potential_opps > 0 && geo_expansion.summary) {
        email_hook = geo_expansion.summary;
    } else {
        email_hook = data_gaps[0]?.hook ? `One thing we noticed: ${data_gaps[0].hook}.` : null;
    }

    const roadmap: GrowthRoadmap = {
        data_gaps,
        cert_unlock,
        adjacent_naics,
        geo_expansion,
        email_hook,
        computed_at: new Date().toISOString(),
    };

    // Persist (best-effort — never fail the response on a cache write).
    const { error: upErr } = await sb.from("contractors").update({ growth_roadmap: roadmap }).eq("id", contractorId);
    if (upErr) console.warn("[cockpit/growth] cache write failed:", upErr.message);

    return NextResponse.json({ ok: true, roadmap, cached: false });
}
