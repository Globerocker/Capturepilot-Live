/**
 * Lead enrichment via Apollo.io `people/match`.
 *
 * Shared helper used by the lead-magnet capture flow (/api/leads) and the
 * Meta Lead Ads webhook so both paths get the same enriched payload before
 * we sync the contact to HubSpot and deliver the magnet email.
 *
 * Apollo's free tier covers `mixed_companies/search` but the richer person
 * data we want here lives on `people/match`, which works on the same key.
 * If the key is unset or the lookup misses, the helper returns null and
 * the caller continues with whatever the user typed into the form — never
 * blocking delivery on an enrichment hit.
 */

export interface EnrichedPerson {
    first_name?: string | null;
    last_name?: string | null;
    title?: string | null;
    seniority?: string | null;
    linkedin_url?: string | null;
    photo_url?: string | null;
    phone?: string | null;
    organization_name?: string | null;
    organization_domain?: string | null;
    organization_industry?: string | null;
    organization_size?: string | null;
    organization_website?: string | null;
    organization_linkedin?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    /** Raw Apollo payload — stored on marketing_leads.apollo_data so we can
     *  re-derive fields later without re-spending an API call. */
    raw?: unknown;
}

const PERSONAL_DOMAINS = new Set([
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "live.com",
    "msn.com",
    "me.com",
    "mac.com",
    "protonmail.com",
    "proton.me",
    "pm.me",
    "gmx.com",
    "gmx.de",
    "gmx.net",
    "web.de",
    "t-online.de",
    "yandex.com",
    "mail.com",
]);

/** Returns the part after @ when it looks like a business domain, else null. */
export function domainFromEmail(email: string): string | null {
    const at = email.lastIndexOf("@");
    if (at < 0) return null;
    const d = email.slice(at + 1).trim().toLowerCase();
    if (!d || PERSONAL_DOMAINS.has(d)) return null;
    return d;
}

/**
 * Look up a person in Apollo by name + domain (or organization name).
 * Returns null when:
 *   - APOLLO_API_KEY is unset (config skip)
 *   - the lookup hard-fails (network / 4xx / 5xx)
 *   - no match found
 *
 * Never throws — caller can treat null as "we have no extra data."
 */
export async function enrichPersonViaApollo(args: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    companyName?: string | null;
    timeoutMs?: number;
}): Promise<EnrichedPerson | null> {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return null;

    const firstName = (args.firstName || "").trim();
    const lastName = (args.lastName || "").trim();
    const domain = domainFromEmail(args.email);
    const orgName = (args.companyName || "").trim();
    // Apollo people/match requires at least one of: name + domain, name + org,
    // or email. We always pass email and let Apollo match on the best signal.
    if (!firstName && !lastName && !domain && !orgName) return null;

    try {
        const res = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey,
                "Cache-Control": "no-cache",
            },
            body: JSON.stringify({
                first_name: firstName || undefined,
                last_name: lastName || undefined,
                email: args.email,
                domain: domain || undefined,
                organization_name: orgName || undefined,
                reveal_personal_emails: false,
                reveal_phone_number: true,
            }),
            signal: AbortSignal.timeout(args.timeoutMs ?? 8000),
        });
        if (!res.ok) {
            console.warn("[apollo] people/match non-2xx:", res.status);
            return null;
        }
        const json = await res.json() as { person?: Record<string, unknown> | null };
        const p = json?.person;
        if (!p) return null;

        // Apollo's phone shape: array of { type: "mobile" | "work_direct" | ..., sanitized_number, raw_number }
        type ApolloPhone = { type?: string; sanitized_number?: string; raw_number?: string };
        const phoneArr = (p.phone_numbers as ApolloPhone[] | undefined) || [];
        const mobile = phoneArr.find((x) => x.type === "mobile")?.sanitized_number;
        const work = phoneArr.find((x) => x.type === "work_direct" || x.type === "work")?.sanitized_number;
        const anyPhone = mobile || work || phoneArr[0]?.sanitized_number || phoneArr[0]?.raw_number || null;

        const org = (p.organization as Record<string, unknown> | undefined) || {};

        return {
            first_name: (p.first_name as string) || null,
            last_name: (p.last_name as string) || null,
            title: (p.title as string) || null,
            seniority: (p.seniority as string) || null,
            linkedin_url: (p.linkedin_url as string) || null,
            photo_url: (p.photo_url as string) || null,
            phone: anyPhone,
            organization_name: (org.name as string) || null,
            organization_domain: (org.primary_domain as string) || domain || null,
            organization_industry: (org.industry as string) || null,
            organization_size: (org.estimated_num_employees as string | number)?.toString() || null,
            organization_website: (org.website_url as string) || null,
            organization_linkedin: (org.linkedin_url as string) || null,
            city: (p.city as string) || null,
            state: (p.state as string) || null,
            country: (p.country as string) || null,
            raw: p,
        };
    } catch (err) {
        console.warn("[apollo] people/match failed:", (err as Error).message);
        return null;
    }
}
