/**
 * Firmographics cascade — Phase 8 of the Quick Checker overhaul.
 *
 * Crawl-only signal for years_in_business / employee_count / revenue is
 * unreliable: maybe 1 in 4 sites prints any of these in plain text. This
 * module hits 4 authoritative sources in priority order and merges the
 * results so the user almost always sees real numbers in their profile.
 *
 * Source ranking (highest → lowest authority):
 *   1. Apollo (organizations/enrich)      paid, employee_count + revenue + founded_year + industry
 *   2. SAM.gov Entity (already fetched)   federal, registration_initial_date → years_in_business
 *   3. OpenCorporates                     free, 500 req/day, incorporation_date + officers
 *   4. Wayback Machine                    free, no auth, first-snapshot date as years-online proxy
 *
 * Each call is timeout-bounded (8s default) and returns null on failure so
 * the caller never blocks on a slow third-party. The merged FirmographicsResult
 * tags every field with `source` so the UI / HubSpot push can show provenance.
 *
 * IMPORTANT: this module is fire-and-forget safe — any caller that already
 * has partial firmographics (e.g. from the deep-extract crawl) passes them
 * in via `existing` and we only fill the GAPS. Never overwrite a value the
 * crawl extracted directly.
 */

// UEI is a 12-char alphanumeric. Inline check — no external dep needed.
function looksLikeUei(s: string | null | undefined): boolean {
    if (!s) return false;
    return /^[A-Z0-9]{12}$/i.test(s.trim());
}

const DEFAULT_TIMEOUT_MS = 8_000;

export type FirmographicSource = "apollo" | "sam" | "opencorporates" | "wayback" | "crawl" | "missing";

export interface FirmographicField<T> {
    value: T | null;
    source: FirmographicSource;
}

export interface FirmographicsResult {
    employee_count: FirmographicField<number>;
    revenue: FirmographicField<number>;
    revenue_band: FirmographicField<string>;
    founded_year: FirmographicField<number>;
    years_in_business: FirmographicField<number>;
    industries: FirmographicField<string[]>;
    /** Country code if found (e.g. "US"). */
    incorporation_country: FirmographicField<string>;
    /** First webarchive snapshot date as years-online proxy. */
    first_seen_online: FirmographicField<string>;
    /** Free-text notes about reconciliation — surfaced in HubSpot. */
    notes: string[];
}

export interface FirmographicsInput {
    /** Public company website domain (no protocol). */
    domain: string;
    /** Best-known company name (crawl or SAM). */
    companyName: string;
    /** SAM UEI if known — short-circuits Apollo + OpenCorporates lookups. */
    uei?: string | null;
    /** Pre-existing firmographics from the crawl. We ONLY fill gaps. */
    existing?: {
        employee_count?: number | null;
        revenue?: number | null;
        founded_year?: number | null;
        industries?: string[];
    };
    /** Optional cached SAM entity payload (skip re-fetch). */
    samEntityRaw?: Record<string, unknown> | null;
}

const APOLLO_KEY = process.env.APOLLO_API_KEY || "";
const SAM_KEY    = process.env.SAM_API_KEY || "";

interface ApolloOrg {
    estimated_num_employees?: number;
    annual_revenue?: number;
    annual_revenue_printed?: string;
    founded_year?: number;
    industry?: string;
    industries?: string[];
    primary_domain?: string;
}

/** Apollo organization enrich (NOT mixed_companies/search — that's for prospecting). */
async function fetchApolloOrg(domain: string, signal: AbortSignal): Promise<ApolloOrg | null> {
    if (!APOLLO_KEY || !domain) return null;
    try {
        const url = `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`;
        const r = await fetch(url, {
            method: "GET",
            headers: { "X-Api-Key": APOLLO_KEY, Accept: "application/json" },
            signal,
        });
        if (!r.ok) return null;
        const j = await r.json() as { organization?: ApolloOrg };
        return j?.organization || null;
    } catch {
        return null;
    }
}

interface SamRegDates {
    registration_initial_date: string | null;
    registration_active_date: string | null;
}

/** Pull registration_initial_date from SAM (legal incorporation proxy). */
async function fetchSamRegDates(uei: string, signal: AbortSignal): Promise<SamRegDates | null> {
    if (!SAM_KEY || !uei) return null;
    try {
        const params = new URLSearchParams({
            ueiSAM: uei,
            registrationStatus: "A",
            includeSections: "entityRegistration",
            api_key: SAM_KEY,
        });
        const r = await fetch(`https://api.sam.gov/entity-information/v3/entities?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_KEY },
            signal,
        });
        if (!r.ok) return null;
        const j = await r.json() as { entityData?: Array<{ entityRegistration?: Record<string, unknown> }> };
        const reg = j?.entityData?.[0]?.entityRegistration;
        if (!reg) return null;
        return {
            registration_initial_date: String(reg.registrationDate || reg.initialRegistrationDate || "") || null,
            registration_active_date: String(reg.lastUpdateDate || reg.activationDate || "") || null,
        };
    } catch {
        return null;
    }
}

interface OpenCorpHit {
    incorporation_date: string | null;
    jurisdiction_code: string | null;
    company_type: string | null;
}

/** Free 500-req/day company directory — for non-Apollo coverage. */
async function searchOpenCorporates(companyName: string, signal: AbortSignal): Promise<OpenCorpHit | null> {
    if (!companyName) return null;
    try {
        const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(companyName)}&jurisdiction_code=us&format=json&per_page=5`;
        const r = await fetch(url, {
            headers: { "User-Agent": "CapturePilot/1.0 (+https://capturepilot.com)" },
            signal,
        });
        if (!r.ok) return null;
        const j = await r.json() as {
            results?: { companies?: Array<{ company?: { incorporation_date: string | null; jurisdiction_code: string | null; company_type: string | null } }> };
        };
        const first = j?.results?.companies?.[0]?.company;
        if (!first) return null;
        return {
            incorporation_date: first.incorporation_date || null,
            jurisdiction_code: first.jurisdiction_code || null,
            company_type: first.company_type || null,
        };
    } catch {
        return null;
    }
}

/** archive.org first-seen as a years-online proxy. */
async function fetchWaybackFirstSeen(domain: string, signal: AbortSignal): Promise<string | null> {
    if (!domain) return null;
    try {
        // The "available" API returns the closest snapshot to a target date.
        // We ask for the earliest one by setting timestamp far in the past.
        const url = `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}&timestamp=19960101`;
        const r = await fetch(url, { signal });
        if (!r.ok) return null;
        const j = await r.json() as { archived_snapshots?: { closest?: { timestamp?: string } } };
        const ts = j?.archived_snapshots?.closest?.timestamp;
        if (!ts || ts.length < 8) return null;
        // Format YYYYMMDD → YYYY-MM-DD
        return `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`;
    } catch {
        return null;
    }
}

function bandFromRevenue(rev: number | null): string | null {
    if (rev === null || rev === undefined) return null;
    if (rev < 1_000_000)            return "under_1m";
    if (rev < 5_000_000)            return "1m_5m";
    if (rev < 25_000_000)           return "5m_25m";
    return "25m_plus";
}

function makeAbortSignal(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
}

/**
 * Main entry — runs the 4 lookups in parallel, merges by source priority,
 * and returns a FirmographicsResult that always has every key (each tagged
 * with the source that supplied it, or "missing" if all sources failed).
 */
export async function enrichFirmographics(input: FirmographicsInput): Promise<FirmographicsResult> {
    const notes: string[] = [];
    const existing = input.existing || {};
    const uei = looksLikeUei(input.uei) ? (input.uei as string).trim() : "";

    // Parallel fan-out — each lookup carries its own abort signal so a slow
    // third-party can't drag down the others.
    const [apollo, sam, openCorp, wayback] = await Promise.all([
        fetchApolloOrg(input.domain, makeAbortSignal(DEFAULT_TIMEOUT_MS)),
        uei ? fetchSamRegDates(uei, makeAbortSignal(DEFAULT_TIMEOUT_MS)) : Promise.resolve(null),
        searchOpenCorporates(input.companyName, makeAbortSignal(DEFAULT_TIMEOUT_MS)),
        fetchWaybackFirstSeen(input.domain, makeAbortSignal(DEFAULT_TIMEOUT_MS)),
    ]);

    if (apollo) notes.push(`Apollo enrichment found for ${input.domain}.`);
    if (sam)    notes.push(`SAM registration date pulled for UEI ${uei}.`);
    if (openCorp?.incorporation_date) notes.push(`OpenCorporates incorporation date: ${openCorp.incorporation_date}.`);

    // ─── Merge each field by source priority ────────────────────────────
    const currentYear = new Date().getFullYear();

    // 1) employee_count — Apollo > existing/crawl
    let employee_count: FirmographicField<number> = { value: null, source: "missing" };
    if (apollo?.estimated_num_employees && apollo.estimated_num_employees > 0) {
        employee_count = { value: apollo.estimated_num_employees, source: "apollo" };
    } else if (existing.employee_count && existing.employee_count > 0) {
        employee_count = { value: existing.employee_count, source: "crawl" };
    }

    // 2) revenue — Apollo only (no other source reliable)
    let revenue: FirmographicField<number> = { value: null, source: "missing" };
    let revenue_band: FirmographicField<string> = { value: null, source: "missing" };
    if (apollo?.annual_revenue && apollo.annual_revenue > 0) {
        revenue = { value: apollo.annual_revenue, source: "apollo" };
        const band = bandFromRevenue(apollo.annual_revenue);
        if (band) revenue_band = { value: band, source: "apollo" };
    } else if (existing.revenue) {
        revenue = { value: existing.revenue, source: "crawl" };
        const band = bandFromRevenue(existing.revenue);
        if (band) revenue_band = { value: band, source: "crawl" };
    }

    // 3) founded_year — Apollo > existing/crawl > SAM > OpenCorporates > Wayback
    let founded_year: FirmographicField<number> = { value: null, source: "missing" };
    if (apollo?.founded_year && apollo.founded_year > 1800 && apollo.founded_year <= currentYear) {
        founded_year = { value: apollo.founded_year, source: "apollo" };
    } else if (existing.founded_year && existing.founded_year > 1800 && existing.founded_year <= currentYear) {
        founded_year = { value: existing.founded_year, source: "crawl" };
    } else if (sam?.registration_initial_date) {
        const y = Number(String(sam.registration_initial_date).slice(0, 4));
        if (y >= 1800 && y <= currentYear) founded_year = { value: y, source: "sam" };
    } else if (openCorp?.incorporation_date) {
        const y = Number(String(openCorp.incorporation_date).slice(0, 4));
        if (y >= 1800 && y <= currentYear) founded_year = { value: y, source: "opencorporates" };
    } else if (wayback) {
        const y = Number(wayback.slice(0, 4));
        if (y >= 1996 && y <= currentYear) {
            founded_year = { value: y, source: "wayback" };
            notes.push(`Founded year inferred from earliest archive.org snapshot (${wayback}) — may underestimate actual founding date.`);
        }
    }

    // 4) years_in_business — derived from founded_year (whatever source)
    const years_in_business: FirmographicField<number> = founded_year.value
        ? { value: currentYear - founded_year.value, source: founded_year.source }
        : { value: null, source: "missing" };

    // 5) industries — Apollo > existing/crawl
    let industries: FirmographicField<string[]> = { value: null, source: "missing" };
    if (apollo?.industries && apollo.industries.length > 0) {
        industries = { value: apollo.industries.slice(0, 5), source: "apollo" };
    } else if (apollo?.industry) {
        industries = { value: [apollo.industry], source: "apollo" };
    } else if (existing.industries && existing.industries.length > 0) {
        industries = { value: existing.industries.slice(0, 5), source: "crawl" };
    }

    // 6) incorporation_country — OpenCorporates > SAM (US implicit)
    let incorporation_country: FirmographicField<string> = { value: null, source: "missing" };
    if (openCorp?.jurisdiction_code) {
        const code = openCorp.jurisdiction_code.split("_")[0].toUpperCase();
        incorporation_country = { value: code, source: "opencorporates" };
    } else if (sam) {
        incorporation_country = { value: "US", source: "sam" };
    }

    // 7) first_seen_online — Wayback only
    const first_seen_online: FirmographicField<string> = wayback
        ? { value: wayback, source: "wayback" }
        : { value: null, source: "missing" };

    return {
        employee_count,
        revenue,
        revenue_band,
        founded_year,
        years_in_business,
        industries,
        incorporation_country,
        first_seen_online,
        notes,
    };
}
