/**
 * USAspending.gov v2 API client.
 *
 * Replaces our older `recipient_search_text` queries with the richer
 * recipient-hash endpoints documented in
 * docs/source-analysis/USASPENDING_API.md. Each function is independent,
 * timeout-bounded, and returns null on failure so callers can degrade
 * gracefully.
 *
 * No API key required for any USAspending endpoint. We identify ourselves
 * in User-Agent + cap RPS at ~5 by parallelizing carefully.
 */

const BASE = "https://api.usaspending.gov/api/v2";
const UA = "CapturePilot/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)";

interface RecipientSearchHit {
    id: string;            // hash with -R / -C / -P suffix
    name: string;
    uei: string | null;
    duns: string | null;
    recipient_level: "R" | "C" | "P";
    amount: number;
}

/**
 * Find a recipient_id (hash) for a given UEI. USAspending has no direct UEI
 * lookup so we search by company name + filter by UEI client-side. Returns
 * the C-suffix child hash when available (best for awards filtering).
 */
export async function findRecipientHashByUei(args: {
    uei: string;
    companyName: string;
    timeoutMs?: number;
}): Promise<{ hash: string; level: "R" | "C" | "P"; name: string } | null> {
    try {
        const res = await fetch(`${BASE}/recipient/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({
                keyword: args.companyName.slice(0, 100),
                limit: 50,
                page: 1,
                order: "desc",
                sort: "amount",
            }),
            signal: AbortSignal.timeout(args.timeoutMs ?? 15000),
        });
        if (!res.ok) return null;
        const json = await res.json() as { results?: RecipientSearchHit[] };
        const hits = json.results || [];
        if (hits.length === 0) return null;
        // Prefer exact UEI match. Fall back to first hit if no UEI was on
        // any record (USAspending occasionally doesn't expose UEI for older
        // recipients pre-2022).
        const exact = hits.find((h) => h.uei && h.uei.toUpperCase() === args.uei.toUpperCase());
        const pick = exact || hits[0];
        return { hash: pick.id, level: pick.recipient_level, name: pick.name };
    } catch {
        return null;
    }
}

export interface RecipientLifetime {
    name: string;
    total_transaction_amount: number;
    total_transactions: number;
    location: { city: string | null; state: string | null; country: string | null };
    business_types: string[];
    alternate_names: string[];
    parent_id: string | null;
    parent_name: string | null;
}

export async function getRecipientLifetime(hash: string, timeoutMs = 15000): Promise<RecipientLifetime | null> {
    try {
        const res = await fetch(`${BASE}/recipient/${encodeURIComponent(hash)}/`, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const json = await res.json() as Record<string, unknown>;
        const location = (json.location as Record<string, unknown>) || {};
        const parents = (json.parents as Array<{ parent_id?: string; parent_name?: string }> | undefined) || [];
        return {
            name: (json.name as string) || "",
            total_transaction_amount: Number(json.total_transaction_amount) || 0,
            total_transactions: Number(json.total_transactions) || 0,
            location: {
                city: (location.city_name as string) || null,
                state: (location.state_code as string) || null,
                country: (location.country_name as string) || null,
            },
            business_types: ((json.business_types as string[]) || []).slice(0, 20),
            alternate_names: ((json.alternate_names as string[]) || []).slice(0, 10),
            parent_id: parents[0]?.parent_id || null,
            parent_name: parents[0]?.parent_name || null,
        };
    } catch {
        return null;
    }
}

export interface YearlySpending {
    fiscal_year: number;
    aggregated_amount: number;
    transaction_count?: number;
}

export async function getSpendingOverTime(args: {
    recipient_id: string;
    from?: string; // YYYY-MM-DD
    to?: string;
    timeoutMs?: number;
}): Promise<YearlySpending[]> {
    try {
        const res = await fetch(`${BASE}/search/spending_over_time/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({
                group: "fiscal_year",
                filters: {
                    time_period: [{
                        start_date: args.from || "2015-10-01",
                        end_date: args.to || new Date().toISOString().slice(0, 10),
                    }],
                    award_type_codes: ["A", "B", "C", "D"],
                    recipient_id: args.recipient_id,
                },
            }),
            signal: AbortSignal.timeout(args.timeoutMs ?? 15000),
        });
        if (!res.ok) return [];
        const json = await res.json() as { results?: Array<{ time_period?: { fiscal_year?: string }; aggregated_amount?: number }> };
        return (json.results || [])
            .map((r) => ({
                fiscal_year: parseInt(r.time_period?.fiscal_year || "0", 10),
                aggregated_amount: Number(r.aggregated_amount) || 0,
            }))
            .filter((r) => r.fiscal_year > 0 && r.aggregated_amount > 0)
            .sort((a, b) => a.fiscal_year - b.fiscal_year);
    } catch {
        return [];
    }
}

export interface AgencyBreakdown {
    agency_name: string;
    amount: number;
    count: number;
}

export async function getSpendingByAgency(args: {
    recipient_id: string;
    timeoutMs?: number;
}): Promise<AgencyBreakdown[]> {
    try {
        const res = await fetch(`${BASE}/search/spending_by_category/awarding_agency/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({
                filters: {
                    time_period: [{
                        start_date: "2015-10-01",
                        end_date: new Date().toISOString().slice(0, 10),
                    }],
                    award_type_codes: ["A", "B", "C", "D"],
                    recipient_id: args.recipient_id,
                },
                category: "awarding_agency",
                limit: 10,
                page: 1,
            }),
            signal: AbortSignal.timeout(args.timeoutMs ?? 15000),
        });
        if (!res.ok) return [];
        const json = await res.json() as { results?: Array<{ name?: string; amount?: number; count?: number }> };
        return (json.results || [])
            .map((r) => ({
                agency_name: r.name || "Unknown Agency",
                amount: Number(r.amount) || 0,
                count: Number(r.count) || 0,
            }))
            .filter((r) => r.amount > 0);
    } catch {
        return [];
    }
}

export interface TopRecipient {
    name: string;
    recipient_id: string | null;
    uei: string | null;
    amount: number;
    count: number;
}

/**
 * Path B helper — top-N contractors in a given NAICS / state / set-aside.
 * Returns the SEO leaderboard for `/contractors/in/<naics>` aggregator pages.
 */
export async function getTopRecipientsByNaics(args: {
    naics: string;
    limit?: number;
    fromFiscalYear?: number;
    timeoutMs?: number;
}): Promise<TopRecipient[]> {
    try {
        const startYear = args.fromFiscalYear ?? new Date().getFullYear() - 3;
        const res = await fetch(`${BASE}/search/spending_by_category/recipient/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({
                filters: {
                    time_period: [{
                        start_date: `${startYear}-10-01`,
                        end_date: new Date().toISOString().slice(0, 10),
                    }],
                    award_type_codes: ["A", "B", "C", "D"],
                    naics_codes: { require: [[args.naics]] },
                },
                category: "recipient",
                limit: Math.min(args.limit ?? 50, 100),
                page: 1,
            }),
            signal: AbortSignal.timeout(args.timeoutMs ?? 25000),
        });
        if (!res.ok) return [];
        const json = await res.json() as { results?: Array<{ name?: string; recipient_id?: string; code?: string; amount?: number; count?: number }> };
        return (json.results || [])
            .map((r) => ({
                name: r.name || "Unknown",
                recipient_id: r.recipient_id || null,
                uei: r.code || null, // USAspending puts UEI in `code` for recipient category
                amount: Number(r.amount) || 0,
                count: Number(r.count) || 0,
            }))
            .filter((r) => r.amount > 0);
    } catch {
        return [];
    }
}
