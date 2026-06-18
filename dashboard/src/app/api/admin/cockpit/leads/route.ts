/**
 * GET /api/admin/cockpit/leads — the cockpit LEAD-QUEUE + single-lead detail.
 *
 * Sources of leads:
 *   • 'contractors' (default) — QC-enriched SAM.gov firms. The bread-and-butter
 *     of the outreach queue. ICP-fit is computed in JS from the contractor row
 *     (veteran / 8(a) / size / past-awards), so we fetch a bounded candidate
 *     working set ordered by top_match_count and sort+paginate in-memory.
 *   • 'inbound' — company_analyses rows (people who ran the public Quick Checker
 *     and left an email). ICP-fit computed from inferred_profile. These are
 *     warm — they came to us — so they're surfaced alongside the cold list.
 *   • 'saved' — ONLY the contractors the calling admin has starred (joined from
 *     cockpit_saved_contractors). Same LeadRow shape as 'contractors'.
 *
 * Every contractor LeadRow carries `saved: boolean` (left-joined from
 * cockpit_saved_contractors for the caller) so the UI can render the star.
 *
 * Filters (all optional):
 *   source           'contractors' | 'inbound' | 'all' | 'saved'   (default 'contractors')
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
 *   naics            repeated/comma-joined NAICS prefixes (2-6 digits each).
 *                    Contractors whose naics_codes array OVERLAPS the selected
 *                    codes match. Exact 6-digit codes use a real array overlap;
 *                    shorter prefixes ALSO match any code that starts with them
 *                    (e.g. '23' → 2361..). Pre-cap DB predicate.
 *   registered_within_months  int → sam_registration_date ≥ now() − N months
 *                    (recently SAM-registered firms; rows without a
 *                    registration date simply don't match).
 *   awarded_within_months     int → last_award_date ≥ now() − N months
 *                    (firms that won a federal award recently).
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
import { assertAdminWithUser } from "@/lib/auth-admin";
import { computeIcpFit, icpTier, type IcpBreakdownItem } from "@/lib/icp-fit";
import { computeDataGaps } from "@/lib/outreach/match-drop";
import { LOOM_BY_GAP } from "@/lib/outreach/loom-videos";
import { toTitleCaseName } from "@/lib/format-name";
import { getNaicsDescription, NAICS_LABELS } from "@/lib/naics-labels";
import { deriveCapabilityKeywords } from "@/lib/derive-keywords";
import { FREE_EMAIL_DOMAINS } from "@/lib/lead-validation";

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
    opp_id: string | null;             // the source notice_id (joins to opportunities.notice_id)
    set_aside: string | null;          // set-aside type
    value: number | string | null;     // estimated contract value (opportunities.award_amount)
    // ── Enriched in the single-lead detail path via a join to `opportunities`
    //    on opp_id (notice_id). Stay null/empty when no join row is found, the
    //    link is flagged broken, or in the bulk LIST path (which never joins). ──
    real_link: string | null;          // opportunities.link — the REAL canonical URL (404 fix); null when link_broken
    description: string | null;        // opportunities.description, trimmed to ~400 chars
    keywords: string[];                 // opportunities.extracted_keywords, top ~8
    why: string[];                      // 1-3 "why it fits" bullets (NAICS/keyword/set-aside/agency)
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
    /**
     * Best-effort company website. Prefers a stored URL (website ?? business_url);
     * when neither exists but a company (non-free-provider) email is on file, we
     * derive https://<domain> from it. So "info@aveterans.com" surfaces
     * aveterans.com instead of "not found".
     */
    derived_website: string | null;
    /** Where derived_website came from: 'stored' (real column) | 'email' (likely site) | null. */
    derived_website_source: "stored" | "email" | null;
    /** Past federal awards + USASpending revenue streams (contractors; null-ish for inbound). */
    past_awards: {
        total_count: number | null;
        total_volume: number | null;
        last_award_date: string | null;
        top_agencies: Array<{ name: string; amount: number | null }>;
        top_naics: Array<{ code: string; label: string; amount: number | null }>;
    };
    /**
     * The single MOST-RECENT federal award from fpds_awards (joined by UEI in the
     * single-lead DETAIL path only — null in the bulk list to avoid N joins).
     * Feeds the email 'award_congrats' template + a UI link. `url` is a
     * USASpending keyword-search link on the PIID when one exists (we have no
     * generated_unique_award_id to build a deterministic /award/ link), else null.
     */
    last_award: {
        date: string | null;
        agency: string | null;
        amount: number | null;
        naics: string | null;
        description: string | null;     // a short, human one-liner about the award
        piid: string | null;
        url: string | null;
    } | null;
    /** Count of fpds_awards rows we hold for this UEI (DETAIL path; null in list). */
    awards_count: number | null;
    // ── V4: surfaced COMPANY profile fields ──────────────────────────────────
    company_address: string | null;         // address_line_1/2 + city/state/zip, one line
    company_history: string | null;         // capability_summary_ai.long_description ?? track_record join
    estimated_revenue: number | null;       // revenue ?? total_award_volume ?? capability_summary_ai.revenue_signal
    // ── V2: surfaced contractor stats + provenance ───────────────────────────
    total_federal_revenue: number | null;   // total_award_volume ?? revenue
    total_federal_awards: number | null;     // total_federal_awards ?? federal_awards_count
    sam_registered: boolean | null;          // is_sam_registered ?? sam_registered
    sam_expiration: string | null;           // SAM registration expiry (expiration_date)
    sam_expiring_soon: boolean;              // expiration within 90 days
    // ── SAM-REFRESH lane (migration 187 + /api/cron/refresh_sam_registration) ──
    registration_status: string | null;     // authoritative SAM 'Active' | 'Inactive' | null
    registered_since: string | null;        // sam_registration_date ("registered since")
    sam_days_to_expiry: number | null;       // days from now to expiration_date (negative if lapsed)
    sam_status_label: string | null;         // human badge: 'Active · expires in N days' | 'Expires in N days' | 'Lapsed' | null
    /** Quick "what do we know" flags for badge rendering in the cockpit. */
    known: { linkedin: boolean; email: boolean; phone: boolean; website: boolean };
    readiness_score?: number | null;        // inbound only
    check_page_url?: string;                // inbound only
    check_analysis_id?: string | null;      // contractors only — set once /check page is materialized
    research?: LeadResearch | null;         // contractors only — persisted research-agent output
    website_url?: string | null;            // contractors only — /site/<slug> if a one-pager was built
    created_at?: string | null;
    /** True when the calling admin has starred this contractor (left-joined from cockpit_saved_contractors). */
    saved?: boolean;
    /** Contractor capability keywords (text[], migration 183) — surfaced for the Keywords tab. */
    capability_keywords: string[];
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
        // naics/set_aside: prefer the opp codes persisted by the enrichment cron
        // (naics_code/set_aside_code), tolerate the legacy/alt blob shapes.
        naics: m?.naics ?? m?.naics_code ?? null,
        opp_id: m?.opp_id ?? m?.notice_id ?? null,
        set_aside: m?.set_aside ?? m?.set_aside_code ?? m?.setAside ?? m?.set_aside_type ?? null,
        value: m?.value ?? m?.award_value ?? m?.estimated_value ?? m?.amount ?? null,
        // Enriched-from-opportunities fields: empty by default; the single-lead
        // detail path fills real_link/description/keywords/why via a batched join.
        real_link: null,
        description: null,
        keywords: [],
        why: [],
    };
}

/** First N words of free text, trimmed to a hard char cap (no mid-word cut at the end). */
function trimText(s: unknown, max = 400): string | null {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/** NAICS overlap classifier between a contractor's codes and an opp's NAICS. */
function naicsFitNote(contractorNaics: string[], oppNaics: string | null): string | null {
    if (!oppNaics || !contractorNaics.length) return null;
    if (contractorNaics.includes(oppNaics)) {
        return `Exact NAICS match (${oppNaics} ${getNaicsDescription(oppNaics)})`;
    }
    if (contractorNaics.some((n) => n.slice(0, 4) === oppNaics.slice(0, 4))) {
        return `Same NAICS industry group (${oppNaics} ${getNaicsDescription(oppNaics)})`;
    }
    if (contractorNaics.some((n) => n.slice(0, 3) === oppNaics.slice(0, 3))) {
        return `Adjacent NAICS sub-sector (${oppNaics} ${getNaicsDescription(oppNaics)})`;
    }
    return null;
}

/** True when the contractor's certs satisfy the opp's set-aside (so they can bid it). */
function isSetAsideEligible(certs: string[], sba: string[], setAside: string | null): boolean {
    if (!setAside) return false;
    const sa = setAside.toLowerCase();
    if (sa.includes("no set") || sa === "none" || sa.includes("unrestricted")) return false;
    const all = [...certs, ...sba].map((c) => c.toLowerCase());
    const has = (...needles: string[]) => needles.some((n) => all.some((c) => c.includes(n)));
    if (sa.includes("8(a)") || sa.includes("8a")) return has("8(a)", "8a");
    if (sa.includes("sdvosb") || sa.includes("service-disabled")) return has("sdvosb");
    if (sa.includes("vosb") || sa.includes("veteran")) return has("vosb", "sdvosb");
    if (sa.includes("hubzone")) return has("hubzone");
    if (sa.includes("edwosb")) return has("edwosb");
    if (sa.includes("wosb") || sa.includes("women")) return has("wosb", "edwosb");
    if (sa.includes("small")) return true; // small-business set-aside — eligible by size posture
    return false;
}

interface OppJoinRow {
    notice_id: string | null;
    link: string | null;
    link_broken: boolean | null;
    description: string | null;
    extracted_keywords: string[] | null;
    structured_requirements: unknown;
    set_aside_code: string | null;
    response_deadline: string | null;
    award_amount: number | null;
    naics_code: string | null;
    psc_code: string | null;
}

/**
 * Enrich a contractor's normalized top_matches (in place, returns a new array)
 * by joining their opp_id (= opportunities.notice_id) back to `opportunities`
 * in ONE batched query. Fills:
 *   real_link    opportunities.link, the REAL canonical URL (the 404 fix) —
 *                nulled when link_broken so the UI never ships a dead link.
 *   description  trimmed ~400 chars.
 *   keywords     extracted_keywords, top ~8.
 *   set_aside / value / deadline / naics  backfilled from the opp when the
 *                stored blob value was missing.
 *   why[]        1-3 bullets: NAICS exact/family match, matched-keyword hits
 *                (from the stored matched_keywords/score_breakdown), set-aside
 *                eligibility, and agencies the contractor has already sold to.
 *
 * `rawMatches` is the un-normalized capability_summary_ai.top_matches array,
 * read positionally for the scorer signals (matched_keywords/score_breakdown)
 * that normalizeTopMatch doesn't carry.
 */
async function enrichTopMatchesFromOpportunities(
    sb: ReturnType<typeof svc>,
    matches: LeadTopMatch[],
    rawMatches: any[],
    contractor: any,
): Promise<LeadTopMatch[]> {
    if (!matches.length) return matches;

    const noticeIds = Array.from(
        new Set(matches.map((m) => m.opp_id).filter((x): x is string => !!x)),
    );
    const byNotice: Record<string, OppJoinRow> = {};
    if (noticeIds.length) {
        const { data: opps } = await sb
            .from("opportunities")
            .select(
                "notice_id, link, link_broken, description, extracted_keywords, structured_requirements, set_aside_code, response_deadline, award_amount, naics_code, psc_code",
            )
            .in("notice_id", noticeIds);
        for (const o of (opps || []) as OppJoinRow[]) {
            if (o.notice_id) byNotice[o.notice_id] = o;
        }
    }

    const contractorNaics: string[] = Array.isArray(contractor?.naics_codes)
        ? contractor.naics_codes.filter(Boolean).map(String)
        : [];
    const certs = toStrArray(contractor?.certifications);
    const sba = toStrArray(contractor?.sba_certifications);
    // Agencies the contractor has already sold to (for the "warm agency" why bullet).
    const soldAgencies = topAgencies(contractor?.agency_relationships, 20).map((a) =>
        a.name.toLowerCase(),
    );

    return matches.map((m, i) => {
        const opp = m.opp_id ? byNotice[m.opp_id] : undefined;
        const raw = rawMatches[i] || {};
        const matchedKeywords: string[] = Array.isArray(raw.matched_keywords)
            ? raw.matched_keywords.filter(Boolean).map(String)
            : [];
        const breakdown: Record<string, number> =
            raw.score_breakdown && typeof raw.score_breakdown === "object" ? raw.score_breakdown : {};

        const oppNaics = opp?.naics_code ?? m.naics ?? null;
        const setAside = opp?.set_aside_code ?? m.set_aside ?? null;
        const agency = m.agency;

        // ── why[] bullets, sharpest signal first, capped at 3 ──
        const why: string[] = [];
        const naicsNote = naicsFitNote(contractorNaics, oppNaics);
        if (naicsNote) why.push(naicsNote);
        if (matchedKeywords.length) {
            const hits = matchedKeywords.slice(0, 4);
            why.push(
                `Matches your capabilities: ${hits.join(", ")}${matchedKeywords.length > 4 ? "…" : ""}`,
            );
        } else if (typeof breakdown.keywords === "number" && breakdown.keywords > 0) {
            why.push("Keyword overlap with the solicitation text");
        }
        if (setAside && isSetAsideEligible(certs, sba, setAside)) {
            why.push(`Set-aside eligible (${setAside})`);
        }
        if (agency && soldAgencies.some((a) => a && (agency.toLowerCase().includes(a) || a.includes(agency.toLowerCase())))) {
            why.push(`You've already won work with ${agency}`);
        }

        const realLink = opp && opp.link && opp.link_broken !== true ? opp.link : null;
        const keywords: string[] = Array.isArray(opp?.extracted_keywords)
            ? opp!.extracted_keywords!.filter(Boolean).map(String).slice(0, 8)
            : [];

        return {
            ...m,
            real_link: realLink,
            description: trimText(opp?.description, 400),
            keywords,
            naics: oppNaics,
            set_aside: setAside,
            value: m.value ?? (opp?.award_amount ?? null),
            deadline: m.deadline ?? (opp?.response_deadline ?? null),
            why: why.slice(0, 3),
        };
    });
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

/** ISO timestamp for `months` months before now (used for the recency filters). */
function monthsAgoISO(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString();
}

/** True when a SAM registration expiry date falls within the next `days` days. */
function isExpiringSoon(expiration: unknown, days = 90): boolean {
    if (!expiration) return false;
    const t = new Date(expiration as string).getTime();
    if (Number.isNaN(t)) return false;
    const now = Date.now();
    return t >= now && t <= now + days * 86400000;
}

/** Whole days from now until `expiration` (negative = already lapsed); null when unparseable. */
function daysToExpiry(expiration: unknown): number | null {
    if (!expiration) return null;
    const t = new Date(expiration as string).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
}

/**
 * Human badge for the cockpit FirmographicsCard. Combines the authoritative SAM
 * registration_status with the computed days-to-expiry:
 *   • lapsed (days < 0)                  → 'Lapsed'
 *   • status === 'Active'                → 'Active · expires in N days'
 *   • status set but not Active          → that status verbatim ('Inactive')
 *   • no status, expiry known + future   → 'Expires in N days'
 *   • nothing usable                     → null
 */
function samStatusLabel(status: string | null, days: number | null): string | null {
    const lapsed = days != null && days < 0;
    if (lapsed) return "Lapsed";
    if (status) {
        if (status.toLowerCase() === "active") {
            return days != null ? `Active · expires in ${days} days` : "Active";
        }
        return status; // 'Inactive' (or any other authoritative SAM status)
    }
    if (days != null) return `Expires in ${days} days`;
    return null;
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

/** Compose a one-line company address from the discrete contractor columns. */
function companyAddress(c: any): string | null {
    const parts = [
        c?.address_line_1,
        c?.address_line_2,
        c?.city,
        c?.state,
        c?.zip_code,
    ]
        .map((x) => (x == null ? "" : String(x).trim()))
        .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
}

/**
 * A human "company history" blurb: the AI long-description if present, else a
 * joined track-record list, else null. Kept short for the cockpit Company tab.
 */
function companyHistory(blob: any): string | null {
    const longDesc = typeof blob?.long_description === "string" ? blob.long_description.trim() : "";
    if (longDesc) return longDesc;
    const tr = toStrArray(blob?.track_record);
    if (tr.length) return tr.slice(0, 5).join(" · ");
    return null;
}

/** revenue ?? total_award_volume ?? capability_summary_ai.revenue_signal, coerced to a number. */
function estimatedRevenue(c: any, blob: any): number | null {
    return toNum(c?.revenue) ?? toNum(c?.total_award_volume) ?? toNum(blob?.revenue_signal);
}

/**
 * Build a USASpending link for a single award. fpds_awards has no
 * generated_unique_award_id, so we cannot construct the deterministic
 * /award/<id> permalink. The reliable fallback is a USASpending keyword search
 * on the PIID, which resolves to the award record. Returns null without a PIID.
 */
function usaSpendingAwardUrl(piid: string | null): string | null {
    const p = (piid || "").trim();
    if (!p) return null;
    return `https://www.usaspending.gov/search/?hash=&keyword=${encodeURIComponent(p)}`;
}

/**
 * Best-effort company website resolution. Returns the stored URL when one is on
 * file (website ?? business_url); otherwise derives https://<domain> from a
 * company email (email ?? primary_poc_email) when its domain is NOT a free
 * provider (gmail/yahoo/…). This turns "info@aveterans.com" into aveterans.com
 * so the cockpit surfaces a likely site instead of "not found".
 *
 *   source 'stored'  — came from a real website/business_url column.
 *   source 'email'   — derived from a company-email domain (label it "likely site").
 *   source null      — nothing usable.
 */
function resolveWebsite(
    stored: unknown,
    ...emails: Array<unknown>
): { url: string | null; source: "stored" | "email" | null } {
    const s = typeof stored === "string" ? stored.trim() : "";
    if (s) return { url: s, source: "stored" };
    for (const e of emails) {
        const email = typeof e === "string" ? e.trim().toLowerCase() : "";
        const domain = email.split("@")[1]?.trim() || "";
        // Need a plausible domain (has a dot) that isn't a free webmail provider.
        if (domain && domain.includes(".") && !FREE_EMAIL_DOMAINS.has(domain)) {
            return { url: `https://${domain}`, source: "email" };
        }
    }
    return { url: null, source: null };
}

/**
 * Fetch the MOST-RECENT fpds_award for a UEI + a total count. Detail-path only.
 * Builds a short human description from the structured fields (FPDS has no free
 * "description" column) and a USASpending keyword-search URL on the PIID.
 */
async function fetchLastAward(
    sb: ReturnType<typeof svc>,
    uei: string | null,
): Promise<{ last_award: LeadRow["last_award"]; awards_count: number | null }> {
    if (!uei) return { last_award: null, awards_count: null };
    try {
        const { data, error, count } = await sb
            .from("fpds_awards")
            .select(
                "piid, awarding_agency, awarding_sub_agency, naics_code, obligation_amount, base_and_all_options, signed_date, effective_date, contract_type, set_aside",
                { count: "exact" },
            )
            .eq("contractor_uei", uei)
            .order("signed_date", { ascending: false, nullsFirst: false })
            .limit(1);
        if (error) throw new Error(error.message);
        const row: any = (data || [])[0];
        if (!row) return { last_award: null, awards_count: count ?? 0 };

        const amount = toNum(row.obligation_amount) ?? toNum(row.base_and_all_options);
        const agency = (row.awarding_sub_agency || row.awarding_agency || null) as string | null;
        const naics = row.naics_code ? String(row.naics_code) : null;
        // FPDS has no free-text description — synthesize a short, human one-liner.
        const descBits: string[] = [];
        if (agency) descBits.push(`Award from ${agency}`);
        if (naics) descBits.push(`NAICS ${naics} (${getNaicsDescription(naics)})`);
        if (row.contract_type) descBits.push(String(row.contract_type));
        const description = descBits.length ? descBits.join(" · ") : null;

        return {
            last_award: {
                date: row.signed_date ?? row.effective_date ?? null,
                agency,
                amount,
                naics,
                description,
                piid: row.piid ? String(row.piid) : null,
                url: usaSpendingAwardUrl(row.piid ? String(row.piid) : null),
            },
            awards_count: count ?? null,
        };
    } catch {
        // fpds_awards may be empty / unmigrated — non-fatal, just omit.
        return { last_award: null, awards_count: null };
    }
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
    // Best-effort site: stored website/business_url, else derived from a company
    // email domain (email or primary_poc_email). source labels stored vs likely.
    const web = resolveWebsite(c.website ?? c.business_url, c.email, c.primary_poc_email);
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
    // Up to 6 matches now (the enrichment cron stores 6). The detail path joins
    // these to `opportunities` to fill real_link/description/keywords/why.
    const top = rawMatches.slice(0, 6).map(normalizeTopMatch);
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
        // Search-by-UEI, NOT /entity/{uei}/coreData — the deep-link path wants
        // SAM's internal entity _id, so a UEI 404s cold. Search always resolves.
        sam_entity_url: c.uei ? `https://sam.gov/search/?q=${encodeURIComponent(c.uei)}&index=ei` : null,
        has_website: !!web.url,
        derived_website: web.url,
        derived_website_source: web.source,
        past_awards: {
            total_count: c.total_federal_awards ?? c.federal_awards_count ?? null,
            total_volume: c.total_award_volume ?? c.revenue ?? null,
            last_award_date: c.last_award_date ?? null,
            top_agencies: topAgencies(c.agency_relationships),
            top_naics: topNaics(c.naics_awards),
        },
        // last_award + awards_count come from fpds_awards — populated only in the
        // single-lead DETAIL path (fetchLastAward), null in the bulk list.
        last_award: null,
        awards_count: null,
        company_address: companyAddress(c),
        company_history: companyHistory(blob),
        estimated_revenue: estimatedRevenue(c, blob),
        total_federal_revenue: c.total_award_volume ?? c.revenue ?? null,
        total_federal_awards: c.total_federal_awards ?? c.federal_awards_count ?? null,
        sam_registered: samRegistered,
        sam_expiration: c.expiration_date ?? null,
        sam_expiring_soon: isExpiringSoon(c.expiration_date),
        registration_status: c.registration_status ?? null,
        registered_since: c.sam_registration_date ?? null,
        sam_days_to_expiry: daysToExpiry(c.expiration_date),
        sam_status_label: samStatusLabel(c.registration_status ?? null, daysToExpiry(c.expiration_date)),
        known: {
            linkedin: !!(linkedin || companyLinkedin),
            email: !!email,
            phone: !!phone,
            website: !!web.url,
        },
        check_analysis_id: c.check_analysis_id ?? null,
        research: normalizeResearch(c.research_findings),
        // website_url is filled in the single-lead detail path (needs a join to
        // contractor_websites); left null in the bulk list to avoid N extra reads.
        website_url: null,
        created_at: c.created_at ?? null,
        // capability_keywords: merge the text[] column with the blob mirror, then
        // fall back to NAICS-derived phrases so the Keywords tab is never empty
        // for a firm whose crawl never produced structured services. The backfill
        // tool persists these into the column; this is the live safety net.
        capability_keywords: deriveCapabilityKeywords({
            existing: [...toStrArray(c.capability_keywords), ...toStrArray(blob.capability_keywords)],
            services: blob.services,
            strengths: blob.strengths,
            naicsLabels: (Array.isArray(c.naics_codes) ? c.naics_codes : [])
                .map((code: unknown) => NAICS_LABELS[String(code)] || null),
        }),
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
    // Best-effort site: stored analysis website, else derive from the lead email
    // domain (free-provider domains are skipped, so a gmail lead stays "no site").
    const web = resolveWebsite(a.website, a.lead_email, inferred.email);

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
        sam_entity_url: inferred.uei ? `https://sam.gov/search/?q=${encodeURIComponent(inferred.uei)}&index=ei` : null,
        has_website: !!web.url,
        derived_website: web.url,
        derived_website_source: web.source,
        // Inbound (company_analyses) has no SAM/award columns — empty past-awards.
        past_awards: {
            total_count: inferred.federal_awards_count ?? null,
            total_volume: null,
            last_award_date: null,
            top_agencies: [],
            top_naics: [],
        },
        // Inbound has no UEI-keyed FPDS history / discrete address columns.
        last_award: null,
        awards_count: null,
        company_address: inferred.address ?? null,
        company_history: typeof inferred.company_description === "string" ? inferred.company_description.trim() || null : null,
        estimated_revenue: toNum(inferred.revenue),
        // Inbound (company_analyses) has no SAM/award columns — null them out.
        total_federal_revenue: null,
        total_federal_awards: inferred.federal_awards_count ?? null,
        sam_registered: null,
        sam_expiration: null,
        sam_expiring_soon: false,
        // Inbound (company_analyses) has no SAM registration columns — null them out.
        registration_status: null,
        registered_since: null,
        sam_days_to_expiry: null,
        sam_status_label: null,
        known: {
            linkedin: !!(linkedin || inferred.company_linkedin || inferred.social_linkedin),
            email: !!email,
            phone: !!phone,
            website: !!web.url,
        },
        readiness_score: a.readiness_score ?? null,
        check_page_url: `/check/${a.id}`,
        created_at: a.created_at ?? null,
        // Inbound: pull whatever keywords the inferred profile carries, then fall
        // back to NAICS-derived phrases so the tab is never empty (read-only; the
        // Keywords edit path is contractors-only).
        capability_keywords: deriveCapabilityKeywords({
            existing: [...toStrArray(inferred.capability_keywords), ...toStrArray(inferred.keywords)],
            naicsLabels: (Array.isArray(inferred.naics_codes) ? inferred.naics_codes : [])
                .map((code: unknown) => NAICS_LABELS[String(code)] || null),
        }),
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
    "id, uei, company_name, website, business_url, email, primary_poc_name, primary_poc_email, primary_poc_title, " +
    "primary_poc_phone, direct_phone, main_phone, phone, " +
    "naics_codes, capability_keywords, certifications, sba_certifications, state, city, address_line_1, address_line_2, zip_code, " +
    "employee_count, years_in_business, " +
    "federal_awards_count, total_federal_awards, total_award_volume, revenue, " +
    "naics_awards, agency_relationships, last_award_date, " +
    "is_sam_registered, sam_registered, expiration_date, registration_status, sam_registration_date, " +
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
    /** NAICS prefixes (2-6 digits). Contractor matches if its naics_codes array overlaps. */
    naics?: string[];
    /** Recently SAM-registered: sam_registration_date ≥ now() − N months. */
    registeredWithinMonths?: number;
    /** Awarded recently: last_award_date ≥ now() − N months. */
    awardedWithinMonths?: number;
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

    // NAICS multi-select. naics_codes is text[]. Match a contractor whose array
    // OVERLAPS the selected codes. Full 6-digit codes use a real array overlap
    // (`ov`); shorter prefixes (e.g. '23' should match '2361..') can't be an
    // overlap, so they use PostgREST's `like(any)` array operator — true when
    // ANY element of the array matches the `<prefix>*` pattern. Both forms are
    // combined into ONE PostgREST .or() so the predicates don't collide
    // (supabase-js routes every .or() through the same `or=` param) — the whole
    // selection lives in a single OR group. Pre-cap DB predicate.
    if (opts.naics && opts.naics.length) {
        const codes = Array.from(
            new Set(
                opts.naics
                    .map((c) => c.replace(/[^0-9]/g, ""))
                    .filter((c) => c.length >= 2 && c.length <= 6),
            ),
        );
        if (codes.length) {
            const exact = codes.filter((c) => c.length === 6);
            const prefixes = codes.filter((c) => c.length < 6);
            const orParts: string[] = [];
            // Exact 6-digit codes → array overlap (cheapest, index-friendly).
            if (exact.length) orParts.push(`naics_codes.ov.{${exact.join(",")}}`);
            // Prefixes → any array element starts with the prefix.
            for (const p of prefixes) orParts.push(`naics_codes.like(any).{${p}*}`);
            if (orParts.length) query = query.or(orParts.join(","));
        }
    }

    // Recently SAM-registered (sam_registration_date is populated by the
    // SAM-refresh lane; rows without it simply won't match — that's fine).
    if (opts.registeredWithinMonths != null && opts.registeredWithinMonths > 0) {
        const cutoff = monthsAgoISO(opts.registeredWithinMonths);
        query = query.not("sam_registration_date", "is", null).gte("sam_registration_date", cutoff);
    }
    // Awarded recently (last_award_date within N months).
    if (opts.awardedWithinMonths != null && opts.awardedWithinMonths > 0) {
        const cutoff = monthsAgoISO(opts.awardedWithinMonths);
        query = query.not("last_award_date", "is", null).gte("last_award_date", cutoff);
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

/** The contractor ids the given admin has starred (cockpit_saved_contractors). */
async function fetchSavedContractorIds(
    sb: ReturnType<typeof svc>,
    adminId: string,
): Promise<Set<string>> {
    const { data, error } = await sb
        .from("cockpit_saved_contractors")
        .select("contractor_id")
        .eq("saved_by", adminId);
    if (error) throw new Error(error.message);
    return new Set((data || []).map((r: any) => String(r.contractor_id)));
}

/**
 * Build full LeadRows for ONLY the contractors the admin has saved. Reads the
 * pins, then the matching contractor rows, then maps them (mirrors
 * fetchContractorLeads' mapper). Applies the same q/state predicates.
 */
async function fetchSavedLeads(
    sb: ReturnType<typeof svc>,
    adminId: string,
    opts: { q?: string; state?: string },
): Promise<{ leads: LeadRow[]; capped: boolean }> {
    const ids = Array.from(await fetchSavedContractorIds(sb, adminId));
    if (ids.length === 0) return { leads: [], capped: false };

    let query = sb
        .from("contractors")
        .select(CONTRACTOR_COLS)
        .in("id", ids.slice(0, CANDIDATE_CAP));
    if (opts.state) query = query.eq("state", opts.state);
    if (opts.q) {
        const safe = opts.q.replace(/[%,]/g, "");
        query = query.ilike("company_name", `%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const leads = (data || []).map(contractorToLead);
    for (const l of leads) l.saved = true; // every row here is, by definition, saved
    return { leads, capped: ids.length > CANDIDATE_CAP };
}

// ───────────────────────── handler ─────────────────────────

export async function GET(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;
    const adminId = gate.userId;

    const sp = req.nextUrl.searchParams;
    const sourceRaw = (sp.get("source") || "contractors").toLowerCase();
    // 'saved' is a contractors view restricted to the caller's pins (cockpit_saved_contractors).
    const source: "contractors" | "inbound" | "all" | "saved" =
        sourceRaw === "inbound" ? "inbound"
        : sourceRaw === "all" ? "all"
        : sourceRaw === "saved" ? "saved"
        : "contractors";

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
            // Detail-only: join the (up to 6) stored matches back to opportunities
            // to fill the REAL canonical link (the 404 fix), description, keywords,
            // and "why it fits" bullets. Best-effort — never block the dossier.
            try {
                const blob = ((data as any).capability_summary_ai || {}) as any;
                const rawMatches = Array.isArray(blob.top_matches) ? blob.top_matches.slice(0, 6) : [];
                lead.top_matches = await enrichTopMatchesFromOpportunities(
                    sb,
                    lead.top_matches,
                    rawMatches,
                    data,
                );
            } catch { /* opportunities join failed — keep the un-enriched matches */ }
            // Detail-only: join the UEI back to fpds_awards for the MOST-RECENT
            // award (date/agency/amount/naics/description + USASpending link) and a
            // total awards_count. Feeds the email 'award_congrats' template + UI link.
            try {
                const { last_award, awards_count } = await fetchLastAward(sb, lead.uei);
                lead.last_award = last_award;
                lead.awards_count = awards_count;
            } catch { /* fpds_awards join failed — keep last_award null */ }
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
            // Reflect whether the calling admin has starred this contractor.
            try {
                const { data: pin } = await sb
                    .from("cockpit_saved_contractors")
                    .select("id")
                    .eq("contractor_id", id)
                    .eq("saved_by", adminId)
                    .maybeSingle();
                lead.saved = !!pin;
            } catch { /* saved table not reachable — leave undefined */ }
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
    // NAICS multi-select: accept BOTH repeated ?naics=23&naics=541511 AND a single
    // comma-joined ?naics=23,541511. Strip non-digits; keep 2-6 digit prefixes.
    const naicsParam: string[] = Array.from(
        new Set(
            sp.getAll("naics")
                .flatMap((v) => v.split(","))
                .map((c) => c.replace(/[^0-9]/g, ""))
                .filter((c) => c.length >= 2 && c.length <= 6),
        ),
    );
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
        naics: naicsParam.length ? naicsParam : undefined,
        registeredWithinMonths: numParam("registered_within_months"),
        awardedWithinMonths: numParam("awarded_within_months"),
    };

    try {
        let pool: LeadRow[] = [];
        let capped = false;

        if (source === "saved") {
            const r = await fetchSavedLeads(sb, adminId, { q, state });
            pool = pool.concat(r.leads);
            capped = capped || r.capped;
        }
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

        // Left-join the caller's saved-pins onto every contractor lead so the UI
        // can render the star state in the list (best-effort — leave undefined on error).
        // (fetchSavedLeads already set saved=true on its rows; this fills the rest.)
        if (source !== "inbound") {
            try {
                const savedIds = await fetchSavedContractorIds(sb, adminId);
                for (const l of pool) {
                    if (l.source === "contractors") l.saved = savedIds.has(l.id);
                }
            } catch { /* saved table not reachable — leave saved undefined */ }
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
