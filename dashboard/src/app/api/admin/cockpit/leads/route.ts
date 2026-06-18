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
 * Rich contractor filters (applied IN the DB query before the CANDIDATE_CAP
 * working set is sliced, so they filter the whole pool — not just the page;
 * ignored for the 'inbound' source which has no contractor columns):
 *   years_min        min years_in_business (gte)
 *   years_max        max years_in_business (lte)
 *   emp_min          min employee_count (gte)
 *   emp_max          max employee_count (lte)
 *   awards_min       min federal_awards_count (gte)
 *   awards_max       max federal_awards_count (lte)
 *   revenue_min      min total_award_volume (gte)
 *   sam_registered   '1' → is_sam_registered = true
 *   expiring_soon    '1' → expiration_date is set AND ≤ now + 90 days
 *   has_linkedin     '1' → owner_linkedin OR social_linkedin OR company_linkedin not null
 *   has_email        '1' → email not null
 *   has_phone        '1' → primary_poc_phone OR direct_phone OR main_phone OR phone not null
 *   has_website      '1' → website not null
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
import { toTitleCaseName } from "@/lib/format-name";
import { getNaicsDescription } from "@/lib/naics-labels";

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
    set_aside: string | null;          // set-aside type when present on the blob
    value: number | string | null;     // estimated contract value when present
    why: string | null;                // a short "why it fits" line when present
}

/** Persisted output of the cockpit company-research agent (contractors only). */
interface LeadResearch {
    overall_sentiment: "positive" | "mixed" | "negative" | "unknown";
    rating: number | null;
    reviews_count: number | null;
    summary: string;
    what_they_do: string;
    sources: Array<{ url: string; title: string; source_type: string }>;
    researched_at: string | null;
}

interface LeadRow {
    id: string;
    source: "contractors" | "inbound";
    uei: string | null;
    company_name: string | null;
    legal_name: string | null;          // from capability_summary_ai.legal_name (contractors)
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
    track_record: string[];            // capability_summary_ai.track_record (contractors; [] for inbound)
    owner_linkedin: string | null;     // the PERSON (never the company/social page)
    company_linkedin: string | null;   // the COMPANY (company_linkedin ?? social_linkedin)
    sam_entity_url: string | null;     // sam.gov coreData page when a UEI is known
    has_website: boolean;
    /** Past federal awards + USASpending revenue streams (contractors; null-ish for inbound). */
    past_awards: {
        total_count: number | null;
        total_volume: number | null;
        last_award_date: string | null;
        top_agencies: Array<{ name: string; amount: number | null }>;
        top_naics: Array<{ code: string; label: string; amount: number | null }>;
    };
    // ── V2: surfaced contractor stats + provenance ───────────────────────────
    total_federal_revenue: number | null;   // total_award_volume ?? revenue
    total_federal_awards: number | null;     // total_federal_awards ?? federal_awards_count
    sam_registered: boolean | null;          // is_sam_registered ?? sam_registered
    sam_expiration: string | null;           // SAM registration expiry (expiration_date)
    sam_expiring_soon: boolean;              // expiration within 90 days
    /** Quick "what do we know" flags for badge rendering in the cockpit. */
    known: { linkedin: boolean; email: boolean; phone: boolean; website: boolean };
    readiness_score?: number | null;        // inbound only
    check_page_url?: string;                // inbound only
    check_analysis_id?: string | null;      // contractors only — set once /check page is materialized
    research?: LeadResearch | null;         // contractors only — persisted research-agent output
    website_url?: string | null;            // contractors only — /site/<slug> if a one-pager was built
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
        // Richer fields surfaced in the cockpit's expandable Matches card. All
        // tolerate the multiple blob shapes seen in prod (and stay null when absent).
        set_aside: m?.set_aside ?? m?.setAside ?? m?.set_aside_type ?? null,
        value: m?.value ?? m?.award_value ?? m?.estimated_value ?? m?.amount ?? null,
        why: (typeof m?.why === "string" && m.why.trim())
            ? m.why.trim()
            : (typeof m?.why_it_fits === "string" && m.why_it_fits.trim())
                ? m.why_it_fits.trim()
                : (typeof m?.reason === "string" && m.reason.trim())
                    ? m.reason.trim()
                    : null,
    };
}

/** Pull the first gap key the contractor matches → its Loom URL (if any). */
function loomForGapKey(gapKey: string | null): string | null {
    if (!gapKey) return null;
    return LOOM_BY_GAP[gapKey]?.url ?? null;
}

/** Normalize a persisted contractors.research_findings blob into LeadResearch (null when absent/empty). */
function normalizeResearch(v: any): LeadResearch | null {
    if (!v || typeof v !== "object") return null;
    const sentiment = ["positive", "mixed", "negative", "unknown"].includes(v.overall_sentiment)
        ? v.overall_sentiment
        : "unknown";
    const sources = Array.isArray(v.sources)
        ? v.sources
            .map((s: any) => ({
                url: String(s?.url || ""),
                title: String(s?.title || ""),
                source_type: String(s?.source_type || "web"),
            }))
            .filter((s: { url: string }) => s.url)
        : [];
    const summary = String(v.summary || "").trim();
    // Treat a row with no summary AND no rating AND no sources as "not researched yet".
    if (!summary && v.rating == null && sources.length === 0) return null;
    return {
        overall_sentiment: sentiment,
        rating: typeof v.rating === "number" ? v.rating : null,
        reviews_count: typeof v.reviews_count === "number" ? v.reviews_count : null,
        summary,
        what_they_do: String(v.what_they_do || "").trim(),
        sources,
        researched_at: v.researched_at ?? null,
    };
}

/** True when a SAM registration expiry date falls within the next `days` days. */
function isExpiringSoon(expiration: unknown, days = 90): boolean {
    if (!expiration) return false;
    const t = new Date(expiration as string).getTime();
    if (Number.isNaN(t)) return false;
    const now = Date.now();
    return t >= now && t <= now + days * 86400000;
}

/** Coerce a money-ish value (number | numeric string) to a finite number or null. */
function toNum(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Normalize agency_relationships → top-N agencies by amount.
 * Probed shapes (both observed in prod, all arrays):
 *   { name, count, amount }           — the common shape
 *   { agency, count, obligated }      — the older USASpending shape
 * Also tolerates an object-map ({ "<agency>": amount | {amount|obligated} }).
 */
function topAgencies(v: unknown, n = 5): Array<{ name: string; amount: number | null }> {
    let entries: Array<{ name: string; amount: number | null }> = [];
    if (Array.isArray(v)) {
        entries = v
            .map((e: any) => {
                if (!e || typeof e !== "object") return null;
                const name = String(e.name || e.agency || "").trim();
                if (!name) return null;
                return { name, amount: toNum(e.amount ?? e.obligated) };
            })
            .filter(Boolean) as Array<{ name: string; amount: number | null }>;
    } else if (v && typeof v === "object") {
        entries = Object.entries(v as Record<string, any>)
            .map(([name, val]) => {
                const nm = String(name || "").trim();
                if (!nm) return null;
                const amount =
                    val && typeof val === "object" ? toNum(val.amount ?? val.obligated) : toNum(val);
                return { name: nm, amount };
            })
            .filter(Boolean) as Array<{ name: string; amount: number | null }>;
    }
    return entries
        .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1))
        .slice(0, n);
}

/**
 * Normalize naics_awards → top-N NAICS by amount.
 * Probed shape (array): { code, count, amount, description }.
 * Prefer the embedded description; fall back to the NAICS label lib.
 * Also tolerates an object-map ({ "<code>": amount | {amount} }).
 */
function topNaics(v: unknown, n = 5): Array<{ code: string; label: string; amount: number | null }> {
    let entries: Array<{ code: string; label: string; amount: number | null }> = [];
    const labelFor = (code: string, desc?: unknown): string => {
        const d = typeof desc === "string" ? desc.trim() : "";
        return d || getNaicsDescription(code);
    };
    if (Array.isArray(v)) {
        entries = v
            .map((e: any) => {
                if (!e || typeof e !== "object") return null;
                const code = String(e.code || "").trim();
                if (!code) return null;
                return { code, label: labelFor(code, e.description), amount: toNum(e.amount) };
            })
            .filter(Boolean) as Array<{ code: string; label: string; amount: number | null }>;
    } else if (v && typeof v === "object") {
        entries = Object.entries(v as Record<string, any>)
            .map(([code, val]) => {
                const c = String(code || "").trim();
                if (!c) return null;
                const amount =
                    val && typeof val === "object" ? toNum(val.amount) : toNum(val);
                const desc = val && typeof val === "object" ? val.description : undefined;
                return { code: c, label: labelFor(c, desc), amount };
            })
            .filter(Boolean) as Array<{ code: string; label: string; amount: number | null }>;
    }
    return entries
        .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1))
        .slice(0, n);
}

/** Build a full contractor lead row from a DB row. */
function contractorToLead(c: any): LeadRow {
    const blob = (c.capability_summary_ai || {}) as any;
    const certifications = toStrArray(c.certifications);
    const sba = toStrArray(c.sba_certifications);

    // Phone fallback chain — the dedicated `phone` column is ~0% populated; the
    // real number, when present, hides in the POC/direct/main columns.
    const phone = c.primary_poc_phone || c.direct_phone || c.main_phone || c.phone || null;
    const email = c.email ?? c.primary_poc_email ?? null;
    // owner_linkedin is the PERSON only — never fall back to the company/social page,
    // which mislabels the company as the owner. company_linkedin carries the company.
    const linkedin = c.owner_linkedin ?? null;
    const companyLinkedin = c.company_linkedin ?? c.social_linkedin ?? null;
    const samRegistered: boolean | null =
        typeof c.is_sam_registered === "boolean" ? c.is_sam_registered
        : typeof c.sam_registered === "boolean" ? c.sam_registered
        : null;

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
        legal_name: (typeof blob.legal_name === "string" && blob.legal_name.trim()) ? blob.legal_name.trim() : null,
        website: c.website ?? null,
        state: c.state ?? null,
        employee_count: c.employee_count ?? null,
        years_in_business: c.years_in_business ?? null,
        federal_awards_count: c.federal_awards_count ?? null,
        certifications,
        sba_certifications: sba,
        contact: {
            name: toTitleCaseName(c.primary_poc_name) ?? null,
            email,
            title: c.primary_poc_title ?? null,
            phone,
        },
        icp_score: icp.score,
        icp_tier: icpTier(icp.score),
        icp_breakdown: icp.breakdown,
        top_matches: top,
        best_match_pct: best,
        match_count: typeof c.top_match_count === "number" ? c.top_match_count : rawMatches.length,
        gaps: blobGaps.length ? blobGaps : computedGaps.map((g) => g.hook),
        gap_hook,
        track_record: toStrArray(blob.track_record),
        loom_url: loomForGapKey(firstGapKey),
        findings_summary: (blob.findings_summary as string) || null,
        owner_linkedin: linkedin,
        company_linkedin: companyLinkedin,
        sam_entity_url: c.uei ? `https://sam.gov/entity/${c.uei}/coreData` : null,
        has_website: !!c.website,
        past_awards: {
            total_count: c.total_federal_awards ?? c.federal_awards_count ?? null,
            total_volume: c.total_award_volume ?? c.revenue ?? null,
            last_award_date: c.last_award_date ?? null,
            top_agencies: topAgencies(c.agency_relationships),
            top_naics: topNaics(c.naics_awards),
        },
        total_federal_revenue: c.total_award_volume ?? c.revenue ?? null,
        total_federal_awards: c.total_federal_awards ?? c.federal_awards_count ?? null,
        sam_registered: samRegistered,
        sam_expiration: c.expiration_date ?? null,
        sam_expiring_soon: isExpiringSoon(c.expiration_date),
        known: {
            linkedin: !!(linkedin || companyLinkedin),
            email: !!email,
            phone: !!phone,
            website: !!c.website,
        },
        check_analysis_id: c.check_analysis_id ?? null,
        research: normalizeResearch(c.research_findings),
        // website_url is filled in the single-lead detail path (needs a join to
        // contractor_websites); left null in the bulk list to avoid N extra reads.
        website_url: null,
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

    const email = a.lead_email ?? null;
    const phone = inferred.phone ?? null;
    // owner_linkedin = the PERSON only; the company/social page lives on company_linkedin.
    const linkedin = inferred.owner_linkedin ?? null;

    return {
        id: String(a.id),
        source: "inbound",
        uei: inferred.uei ?? null,
        company_name: a.company_name ?? null,
        legal_name: null,
        website: a.website ?? null,
        state: inferred.state ?? inferred.business_state ?? null,
        employee_count: inferred.employee_count ?? null,
        years_in_business: inferred.years_in_business ?? null,
        federal_awards_count: inferred.federal_awards_count ?? null,
        certifications,
        sba_certifications: sba,
        contact: {
            name: toTitleCaseName(inferred.contact_person) ?? null,
            email,
            title: null,
            phone,
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
        track_record: [],
        owner_linkedin: linkedin,
        company_linkedin: inferred.company_linkedin ?? inferred.social_linkedin ?? null,
        sam_entity_url: inferred.uei ? `https://sam.gov/entity/${inferred.uei}/coreData` : null,
        has_website: !!a.website,
        // Inbound (company_analyses) has no SAM/award columns — empty past-awards.
        past_awards: {
            total_count: inferred.federal_awards_count ?? null,
            total_volume: null,
            last_award_date: null,
            top_agencies: [],
            top_naics: [],
        },
        // Inbound (company_analyses) has no SAM/award columns — null them out.
        total_federal_revenue: null,
        total_federal_awards: inferred.federal_awards_count ?? null,
        sam_registered: null,
        sam_expiration: null,
        sam_expiring_soon: false,
        known: {
            linkedin: !!(linkedin || inferred.company_linkedin || inferred.social_linkedin),
            email: !!email,
            phone: !!phone,
            website: !!a.website,
        },
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
    "id, uei, company_name, website, email, primary_poc_name, primary_poc_email, primary_poc_title, " +
    "primary_poc_phone, direct_phone, main_phone, phone, " +
    "naics_codes, certifications, sba_certifications, state, city, employee_count, years_in_business, " +
    "federal_awards_count, total_federal_awards, total_award_volume, revenue, " +
    "naics_awards, agency_relationships, last_award_date, " +
    "is_sam_registered, sam_registered, expiration_date, " +
    "qc_enriched, top_match_count, capability_summary_ai, owner_linkedin, social_linkedin, company_linkedin, " +
    "website_cms, check_analysis_id, research_findings, created_at";

const ANALYSIS_COLS =
    "id, company_name, website, lead_email, readiness_score, readiness_breakdown, inferred_profile, preview_matches, status, created_at";

/**
 * Rich contractor filters — applied as Supabase predicates BEFORE the
 * CANDIDATE_CAP slice so they constrain the entire ~3275-row pool, not just the
 * page the caller is on. (Post-ICP filters like tier/min_icp still run in JS in
 * the handler because ICP is computed there.)
 */
interface ContractorFilters {
    q?: string;
    state?: string;
    onlyWithMatches: boolean;
    yearsMin?: number;
    yearsMax?: number;
    empMin?: number;
    empMax?: number;
    awardsMin?: number;
    awardsMax?: number;
    revenueMin?: number;
    samRegistered?: boolean;
    expiringSoon?: boolean;
    hasLinkedin?: boolean;
    hasEmail?: boolean;
    hasPhone?: boolean;
    hasWebsite?: boolean;
}

async function fetchContractorLeads(
    sb: ReturnType<typeof svc>,
    opts: ContractorFilters,
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

    // Numeric range filters (run on the whole pool, pre-cap).
    if (opts.yearsMin != null) query = query.gte("years_in_business", opts.yearsMin);
    if (opts.yearsMax != null) query = query.lte("years_in_business", opts.yearsMax);
    if (opts.empMin != null) query = query.gte("employee_count", opts.empMin);
    if (opts.empMax != null) query = query.lte("employee_count", opts.empMax);
    if (opts.awardsMin != null) query = query.gte("federal_awards_count", opts.awardsMin);
    if (opts.awardsMax != null) query = query.lte("federal_awards_count", opts.awardsMax);
    if (opts.revenueMin != null) query = query.gte("total_award_volume", opts.revenueMin);

    // Boolean / presence filters.
    if (opts.samRegistered) query = query.eq("is_sam_registered", true);
    if (opts.expiringSoon) {
        const cutoff = new Date(Date.now() + 90 * 86400000).toISOString();
        query = query.not("expiration_date", "is", null).lte("expiration_date", cutoff);
    }
    // Presence OR-groups: supabase-js routes EVERY .or() through the same `or=`
    // param, so two separate .or() calls collide and PostgREST keeps only one.
    // Collect the groups and emit a SINGLE .or(), AND-nesting when both are on.
    const liGroup = "owner_linkedin.not.is.null,social_linkedin.not.is.null,company_linkedin.not.is.null";
    const phGroup = "primary_poc_phone.not.is.null,direct_phone.not.is.null,main_phone.not.is.null,phone.not.is.null";
    if (opts.hasLinkedin && opts.hasPhone) {
        query = query.or(`and(or(${liGroup}),or(${phGroup}))`);
    } else if (opts.hasLinkedin) {
        query = query.or(liGroup);
    } else if (opts.hasPhone) {
        query = query.or(phGroup);
    }
    if (opts.hasEmail) query = query.not("email", "is", null);
    if (opts.hasWebsite) query = query.not("website", "is", null);

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
            const lead = contractorToLead(data);
            // Surface an already-built one-pager (if any) so the UI can show its
            // shareable link on reload without re-building. Best-effort; ignore errors.
            try {
                const { data: site } = await sb
                    .from("contractor_websites")
                    .select("slug")
                    .eq("contractor_id", id)
                    .maybeSingle();
                if (site?.slug) lead.website_url = `/site/${site.slug}`;
            } catch { /* table may be empty / not migrated yet — non-fatal */ }
            return NextResponse.json({ lead });
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

    // Rich contractor filters. Parsed into the ContractorFilters shape; each is
    // optional and only applied when present/truthy. Numeric ranges are parsed
    // with a NaN guard so a junk value is treated as "no filter".
    const numParam = (k: string): number | undefined => {
        const raw = sp.get(k);
        if (raw == null || raw.trim() === "") return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
    };
    const flagParam = (k: string): boolean => sp.get(k) === "1";
    const contractorFilters: ContractorFilters = {
        q,
        state,
        onlyWithMatches,
        yearsMin: numParam("years_min"),
        yearsMax: numParam("years_max"),
        empMin: numParam("emp_min"),
        empMax: numParam("emp_max"),
        awardsMin: numParam("awards_min"),
        awardsMax: numParam("awards_max"),
        revenueMin: numParam("revenue_min"),
        samRegistered: flagParam("sam_registered"),
        expiringSoon: flagParam("expiring_soon"),
        hasLinkedin: flagParam("has_linkedin"),
        hasEmail: flagParam("has_email"),
        hasPhone: flagParam("has_phone"),
        hasWebsite: flagParam("has_website"),
    };

    try {
        let pool: LeadRow[] = [];
        let capped = false;

        if (source === "contractors" || source === "all") {
            const r = await fetchContractorLeads(sb, contractorFilters);
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
