/**
 * People Data Labs client — contact + company enrichment.
 *
 * Background: Apollo's `people/match` returns "insufficient credits" on our
 * current plan (2026-05-27 audit), so the contractor email column stayed
 * empty despite the cron running for months. PDL's free tier ships 1,000
 * calls/month + person + company enrichment, more than enough for the
 * 2,262-row audience-having-federal-awards contractor backlog.
 *
 * Pricing: free 1000/mo, then $98/mo for 2,500 calls (Apollo replacement
 * roughly at half the price).
 *
 * Set PDL_API_KEY in env. Endpoint: https://api.peopledatalabs.com/v5/
 */

const PDL_API_KEY = process.env.PDL_API_KEY || "";
const PDL_BASE = "https://api.peopledatalabs.com/v5";

export function isPdlConfigured(): boolean {
    return !!PDL_API_KEY;
}

export interface PdlPerson {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    work_email: string | null;
    personal_emails: string[];
    mobile_phone: string | null;
    linkedin_url: string | null;
    job_company_name: string | null;
    job_company_website: string | null;
    location_country: string | null;
}

interface PdlPersonResponse {
    status: number;
    likelihood?: number;
    data?: {
        full_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        job_title?: string | null;
        work_email?: string | null;
        personal_emails?: string[];
        mobile_phone?: string | null;
        linkedin_url?: string | null;
        job_company_name?: string | null;
        job_company_website?: string | null;
        location_country?: string | null;
    };
    error?: { type?: string; message?: string };
}

/**
 * Person enrichment by company + best-effort identifier.
 * For contractor lookups: we usually know the company name + domain (from
 * SAM data) but only sometimes a specific POC name. Call with whatever
 * we have; PDL returns the highest-likelihood match.
 *
 * Returns null on no-match or non-200 (no throw — caller decides to fall
 * back to other providers / leave the row empty).
 *
 * Cost: 1 credit per call that returns 200 with a match. 404/no-match is free.
 */
export async function pdlPersonByCompany(args: {
    companyName?: string | null;
    companyDomain?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    /** Minimum likelihood (0-10) — PDL recommends 6+ for high-confidence
        results. Default 6. Below this we return null to avoid bad emails. */
    minLikelihood?: number;
}): Promise<{ person: PdlPerson | null; blocked: boolean }> {
    if (!PDL_API_KEY) throw new Error("PDL_API_KEY not configured");

    const params = new URLSearchParams();
    if (args.companyName) params.set("company", args.companyName);
    if (args.companyDomain) params.set("profile", `linkedin.com/company/${args.companyDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0]}`);
    if (args.firstName) params.set("first_name", args.firstName);
    if (args.lastName) params.set("last_name", args.lastName);

    // No criteria? PDL would error — guard.
    if (params.toString().length === 0) {
        return { person: null, blocked: false };
    }

    const res = await fetch(`${PDL_BASE}/person/enrich?${params}&min_likelihood=${args.minLikelihood ?? 6}`, {
        headers: { "X-Api-Key": PDL_API_KEY },
        signal: AbortSignal.timeout(15_000),
    });

    // 402 / 429 / 403 = credits or rate limit. Caller should stop calling
    // PDL for this run to avoid hammering it.
    if (res.status === 402 || res.status === 429 || res.status === 403) {
        return { person: null, blocked: true };
    }

    const data = (await res.json()) as PdlPersonResponse;
    if (data.status !== 200 || !data.data) {
        return { person: null, blocked: false };
    }

    const d = data.data;
    return {
        person: {
            full_name: d.full_name ?? null,
            first_name: d.first_name ?? null,
            last_name: d.last_name ?? null,
            job_title: d.job_title ?? null,
            work_email: d.work_email ?? null,
            personal_emails: d.personal_emails ?? [],
            mobile_phone: d.mobile_phone ?? null,
            linkedin_url: d.linkedin_url ?? null,
            job_company_name: d.job_company_name ?? null,
            job_company_website: d.job_company_website ?? null,
            location_country: d.location_country ?? null,
        },
        blocked: false,
    };
}

/**
 * Company enrichment by name + domain. Fills in industry, employee count,
 * LinkedIn URL when we have a partial record. ~half the PDL credit cost of
 * person enrichment so use it freely for company-only enrichment passes.
 */
export async function pdlCompanyByDomain(domain: string): Promise<{
    name: string | null;
    website: string | null;
    industry: string | null;
    employee_count: number | null;
    linkedin_url: string | null;
    country: string | null;
} | null> {
    if (!PDL_API_KEY) throw new Error("PDL_API_KEY not configured");

    const res = await fetch(`${PDL_BASE}/company/enrich?website=${encodeURIComponent(domain)}`, {
        headers: { "X-Api-Key": PDL_API_KEY },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
        status?: number;
        name?: string | null;
        website?: string | null;
        industry?: string | null;
        employee_count?: number | null;
        linkedin_url?: string | null;
        location?: { country?: string | null };
    };
    if (data.status !== 200) return null;
    return {
        name: data.name ?? null,
        website: data.website ?? null,
        industry: data.industry ?? null,
        employee_count: data.employee_count ?? null,
        linkedin_url: data.linkedin_url ?? null,
        country: data.location?.country ?? null,
    };
}
