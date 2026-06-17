/**
 * GET /api/admin/cockpit/leads — the cockpit LEAD-QUEUE + single-lead detail.
 *
 * Two sources of leads:
 *   • 'contractors' (default) — QC-enriched SAM.gov firms. The bread-and-butter
 *     of the outreach queue. ICP-fit is computed in JS from the contractor row
 *     (veteran / 8(a) / size / past-awards), so we fetch a bounded candidate
 *     working set ordered by top_match_count and sort+paginate in-memory.
 *   • 'inbound' — company_analyses rows (people who ran the public Quick Checker
 *     and left an email). ICP-fit computed from inferred_profile. These are
 *     warm — they came to us — so they're surfaced alongside the cold list.
 *
 * Filters (all optional):
 *   source           'contractors' | 'inbound' | 'all'   (default 'contractors')
 *   q                company-name search (ilike)
 *   state            two-letter state
 *   min_icp          minimum ICP score 0-100 (default 0)
 *   only_with_matches default true for contractors (top_match_count > 0)
 *   tier             'A' | 'B' | 'C'  (post-ICP filter)
 *   sort             'icp' | 'matches' | 'recent'  (default 'icp')
 *   page             1-based page number (default 1)
 *   pageSize         default 50, max 200
 *
 * Single-lead detail: GET ...?id=<contractor_id or analysis_id>&source=...
 *   returns { lead: <full dossier> }.
 *
 * Response (list):
 * {
 *   source, page, pageSize, total, capped,
 *   leads: LeadRow[]
 * }
 *
 * Admin-gated via assertAdmin(). Service client for the heavy reads.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { computeIcpFit, icpTier, type IcpBreakdownItem } from "@/lib/icp-fit";
import { computeDataGaps } from "@/lib/outreach/match-drop";
import { LOOM_BY_GAP } from "@/lib/outreach/loom-videos";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

// Bounded candidate pool for the in-memory ICP sort. If the filtered pool would
// exceed this, the response carries capped:true so the caller knows the queue is
// truncated (we never silently drop below the pool).
const CANDIDATE_CAP = 4000;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

// ───────────────────────── shared shapes ─────────────────────────

interface LeadTopMatch {
    title: string;
    agency: string | null;
    score_pct: number;       // 0-100
    pwin: number | null;     // 0-100 if present on the blob
    deadline: string | null;
    naics: string | null;
    opp_id: string | null;
}

interface LeadRow {
    id: string;
    source: "contractors" | "inbound";
    uei: string | null;
    company_name: string | null;
    website: string | null;
    state: string | null;
    employee_count: number | null;
    years_in_business: number | null;
    federal_awards_count: number | null;
    certifications: string[];
    sba_certifications: string[];
    contact: { name: string | null; email: string | null; title: string | null; phone: string | null };
    icp_score: number;
    icp_tier: "A" | "B" | "C";
    icp_breakdown: IcpBreakdownItem[];
    top_matches: LeadTopMatch[];
    best_match_pct: number | null;
    match_count: number;
    gaps: string[];
    gap_hook: string | null;
    loom_url: string | null;
    findings_summary: string | null;
    owner_linkedin: string | null;
    has_website: boolean;
    readiness_score?: number | null;        // inbound only
    check_page_url?: string;                // inbound only
    check_analysis_id?: string | null;      // contractors only — set once /check page is materialized
    created_at?: string | null;
}

// ───────────────────────── normalizers ─────────────────────────

function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) => (typeof x === "string" ? x : (x && typeof x === "object" ? String((x as any).type || (x as any).name || "") : "")))
        .filter(Boolean);
}

/**
 * Normalize one entry from capability_summary_ai.top_matches. Handles BOTH the
 * legacy shape (notice_id/title/agency/pwin/score) and the richer spec shape
 * (title/agency/score(0-1)/pwin/deadline/naics/opp_id).
 */
function normalizeTopMatch(m: any): LeadTopMatch {
    const rawScore = typeof m?.score === "number" ? m.score : null;
    // score may be 0-1 (lead-magnet scorer) or already a percent — coerce to %.
    const scorePct = rawScore == null
        ? 0
        : rawScore <= 1
            ? Math.round(rawScore * 100)
            : Math.round(rawScore);
    const pwin = typeof m?.pwin === "number"
        ? (m.pwin <= 1 ? Math.round(m.pwin * 100) : Math.round(m.pwin))
        : null;
    return {
        title: String(m?.title || "Untitled opportunity"),
        agency: m?.agency ?? null,
        score_pct: scorePct,
        pwin,
        deadline: m?.deadline ?? null,
        naics: m?.naics ?? null,
        opp_id: m?.opp_id ?? m?.notice_id ?? null,
    };
}

/** Pull the first gap key the contractor matches → its Loom URL (if any). */
function loomForGapKey(gapKey: string | null): string | null {
    if (!gapKey) return null;
    return LOOM_BY_GAP[gapKey]?.url ?? null;
}

/** Build a full contractor lead row from a DB row. */
function contractorToLead(c: any): LeadRow {
    const blob = (c.capability_summary_ai || {}) as any;
    const certifications = toStrArray(c.certifications);
    const sba = toStrArray(c.sba_certifications);

    const icp = computeIcpFit({
        certifications,
        sba_certifications: sba,
        employee_count: c.employee_count ?? null,
        years_in_business: c.years_in_business ?? null,
        federal_awards_count: c.federal_awards_count ?? null,
    });

    const rawMatches = Array.isArray(blob.top_matches) ? blob.top_matches : [];
    const top = rawMatches.slice(0, 3).map(normalizeTopMatch);
    const best = top.length ? Math.max(...top.map((t: LeadTopMatch) => t.score_pct)) : null;

    // Gaps: prefer the blob's stored data_gaps; recompute hook + loom from the
    // shared helper so we always get the sharpest (first) gap + its video.
    const blobGaps = toStrArray(blob.data_gaps);
    const { gaps: computedGaps, gap_hook: computedHook } = computeDataGaps(blob, c);
    const firstGapKey = computedGaps[0]?.key ?? null;
    const gap_hook = (blob.gap_hook as string) || computedHook || null;

    return {
        id: String(c.id),
        source: "contractors",
        uei: c.uei ?? null,
        company_name: c.company_name ?? null,
        website: c.website ?? null,
        state: c.state ?? null,
        employee_count: c.employee_count ?? null,
        years_in_business: c.years_in_business ?? null,
        federal_awards_count: c.federal_awards_count ?? null,
        certifications,
        sba_certifications: sba,
        contact: {
            name: c.primary_poc_name ?? null,
            email: c.email ?? c.primary_poc_email ?? null,
            title: c.primary_poc_title ?? null,
            phone: c.phone ?? null,
        },
        icp_score: icp.score,
        icp_tier: icpTier(icp.score),
        icp_breakdown: icp.breakdown,
        top_matches: top,
        best_match_pct: best,
        match_count: typeof c.top_match_count === "number" ? c.top_match_count : rawMatches.length,
        gaps: blobGaps.length ? blobGaps : computedGaps.map((g) => g.hook),
        gap_hook,
        loom_url: loomForGapKey(firstGapKey),
        findings_summary: (blob.findings_summary as string) || null,
        owner_linkedin: c.owner_linkedin ?? c.social_linkedin ?? null,
        has_website: !!c.website,
        check_analysis_id: c.check_analysis_id ?? null,
        created_at: c.created_at ?? null,
    };
}

/** Build a full inbound (Quick Checker) lead row from a company_analyses row. */
function analysisToLead(a: any): LeadRow {
    const inferred = (a.inferred_profile || {}) as any;
    const certifications = toStrArray(inferred.sba_certifications || inferred.certifications);
    const sba = toStrArray(inferred.sba_certifications);

    const icp = computeIcpFit({
        certifications,
        sba_certifications: sba,
        employee_count: inferred.employee_count ?? null,
        years_in_business: inferred.years_in_business ?? null,
        // company_analyses has no award count — leave null (scorer treats as green).
        federal_awards_count: inferred.federal_awards_count ?? null,
    });

    const rawMatches = Array.isArray(a.preview_matches) ? a.preview_matches : [];
    const top = rawMatches.slice(0, 3).map(normalizeTopMatch);
    const best = top.length ? Math.max(...top.map((t: LeadTopMatch) => t.score_pct)) : null;

    return {
        id: String(a.id),
        source: "inbound",
        uei: inferred.uei ?? null,
        company_name: a.company_name ?? null,
        website: a.website ?? null,
        state: inferred.state ?? inferred.business_state ?? null,
        employee_count: inferred.employee_count ?? null,
        years_in_business: inferred.years_in_business ?? null,
        federal_awards_count: inferred.federal_awards_count ?? null,
        certifications,
        sba_certifications: sba,
        contact: {
            name: inferred.contact_person ?? null,
            email: a.lead_email ?? null,
            title: null,
            phone: inferred.phone ?? null,
        },
        icp_score: icp.score,
        icp_tier: icpTier(icp.score),
        icp_breakdown: icp.breakdown,
        top_matches: top,
        best_match_pct: best,
        match_count: rawMatches.length,
        gaps: [],
        gap_hook: null,
        loom_url: null,
        findings_summary: null,
        owner_linkedin: null,
        has_website: !!a.website,
        readiness_score: a.readiness_score ?? null,
        check_page_url: `/check/${a.id}`,
        created_at: a.created_at ?? null,
    };
}

// ───────────────────────── sorting ─────────────────────────

function sortLeads(leads: LeadRow[], sort: string): LeadRow[] {
    const copy = [...leads];
    if (sort === "matches") {
        copy.sort((x, y) => (y.best_match_pct ?? -1) - (x.best_match_pct ?? -1) || y.match_count - x.match_count);
    } else if (sort === "recent") {
        copy.sort((x, y) => {
            const tx = x.created_at ? new Date(x.created_at).getTime() : 0;
            const ty = y.created_at ? new Date(y.created_at).getTime() : 0;
            return ty - tx;
        });
    } else {
        // icp (default)
        copy.sort((x, y) => y.icp_score - x.icp_score || (y.best_match_pct ?? -1) - (x.best_match_pct ?? -1));
    }
    return copy;
}

// ───────────────────────── fetchers ─────────────────────────

const CONTRACTOR_COLS =
    "id, uei, company_name, website, email, primary_poc_name, primary_poc_email, primary_poc_title, phone, " +
    "naics_codes, certifications, sba_certifications, state, city, employee_count, years_in_business, " +
    "federal_awards_count, qc_enriched, top_match_count, capability_summary_ai, owner_linkedin, social_linkedin, website_cms, check_analysis_id, created_at";

const ANALYSIS_COLS =
    "id, company_name, website, lead_email, readiness_score, readiness_breakdown, inferred_profile, preview_matches, status, created_at";

async function fetchContractorLeads(
    sb: ReturnType<typeof svc>,
    opts: { q?: string; state?: string; onlyWithMatches: boolean },
): Promise<{ leads: LeadRow[]; capped: boolean }> {
    let query = sb
        .from("contractors")
        .select(CONTRACTOR_COLS)
        .eq("qc_enriched", true)
        // Order so the truncation, if it happens, keeps the most-matched firms.
        .order("top_match_count", { ascending: false, nullsFirst: false })
        .limit(CANDIDATE_CAP + 1);

    if (opts.onlyWithMatches) query = query.gt("top_match_count", 0);
    if (opts.state) query = query.eq("state", opts.state);
    if (opts.q) {
        const safe = opts.q.replace(/[%,]/g, "");
        query = query.ilike("company_name", `%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data || [];
    const capped = rows.length > CANDIDATE_CAP;
    const leads = rows.slice(0, CANDIDATE_CAP).map(contractorToLead);
    return { leads, capped };
}

async function fetchInboundLeads(
    sb: ReturnType<typeof svc>,
    opts: { q?: string; state?: string },
): Promise<{ leads: LeadRow[]; capped: boolean }> {
    let query = sb
        .from("company_analyses")
        .select(ANALYSIS_COLS)
        .eq("status", "complete")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(CANDIDATE_CAP + 1);

    if (opts.q) {
        const safe = opts.q.replace(/[%,]/g, "");
        query = query.ilike("company_name", `%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data || [];
    const capped = rows.length > CANDIDATE_CAP;
    let leads = rows.slice(0, CANDIDATE_CAP).map(analysisToLead);
    // company_analyses has no state column — filter the mapped (inferred) state.
    if (opts.state) leads = leads.filter((l) => l.state === opts.state);
    return { leads, capped };
}

// ───────────────────────── handler ─────────────────────────

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sp = req.nextUrl.searchParams;
    const sourceRaw = (sp.get("source") || "contractors").toLowerCase();
    const source: "contractors" | "inbound" | "all" =
        sourceRaw === "inbound" ? "inbound" : sourceRaw === "all" ? "all" : "contractors";

    const id = sp.get("id");
    const sb = svc();

    // ── Single-lead detail ──────────────────────────────────────────────────
    if (id) {
        try {
            // Determine which table to read. Default to contractors unless the
            // caller pinned source=inbound.
            if (source === "inbound") {
                const { data, error } = await sb
                    .from("company_analyses")
                    .select(ANALYSIS_COLS)
                    .eq("id", id)
                    .maybeSingle();
                if (error) return NextResponse.json({ error: error.message }, { status: 500 });
                if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
                return NextResponse.json({ lead: analysisToLead(data) });
            }
            const { data, error } = await sb
                .from("contractors")
                .select(CONTRACTOR_COLS)
                .eq("id", id)
                .maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
            return NextResponse.json({ lead: contractorToLead(data) });
        } catch (e: any) {
            return NextResponse.json({ error: e?.message || "lookup failed" }, { status: 500 });
        }
    }

    // ── List / queue ────────────────────────────────────────────────────────
    const q = sp.get("q")?.trim() || undefined;
    const state = sp.get("state")?.trim().toUpperCase() || undefined;
    const minIcp = Math.max(0, Math.min(100, Number(sp.get("min_icp") || 0)));
    const tierFilter = sp.get("tier")?.toUpperCase();
    const sort = (sp.get("sort") || "icp").toLowerCase();
    const page = Math.max(1, Number(sp.get("page") || 1));
    const pageSize = Math.min(Math.max(1, Number(sp.get("pageSize") || 50)), 200);
    // only_with_matches defaults true for contractors; ignored for inbound.
    const onlyWithMatches = sp.get("only_with_matches") !== "false" && sp.get("only_with_matches") !== "0";

    try {
        let pool: LeadRow[] = [];
        let capped = false;

        if (source === "contractors" || source === "all") {
            const r = await fetchContractorLeads(sb, { q, state, onlyWithMatches });
            pool = pool.concat(r.leads);
            capped = capped || r.capped;
        }
        if (source === "inbound" || source === "all") {
            const r = await fetchInboundLeads(sb, { q, state });
            pool = pool.concat(r.leads);
            capped = capped || r.capped;
        }

        // Post-ICP filters (computed in JS, so applied here).
        if (minIcp > 0) pool = pool.filter((l) => l.icp_score >= minIcp);
        if (tierFilter === "A" || tierFilter === "B" || tierFilter === "C") {
            pool = pool.filter((l) => l.icp_tier === tierFilter);
        }

        const sorted = sortLeads(pool, sort);
        const total = sorted.length;
        const start = (page - 1) * pageSize;
        const leads = sorted.slice(start, start + pageSize);

        return NextResponse.json({
            source,
            page,
            pageSize,
            total,
            capped,
            leads,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "query failed" }, { status: 500 });
    }
}
