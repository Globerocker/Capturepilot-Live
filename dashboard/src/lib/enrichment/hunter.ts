/**
 * Hunter.io email-finder integration.
 *
 *   findEmail({ domain, firstName, lastName })
 *     → /v2/email-finder — best-guess email for a known person at a domain.
 *       Returns confidence + position + verification status.
 *
 *   domainSearch({ domain })
 *     → /v2/domain-search — all emails Hunter has seen on a domain. Used
 *       as a fallback when we don't know the POC's name yet; we pick the
 *       most senior contact (CEO > President > Founder > …).
 *
 * Both helpers degrade gracefully:
 *   - 401 / 403 → API key invalid; caller should stop calling Hunter for the
 *     remainder of the run (returned as `blocked: true`).
 *   - 429       → rate-limited; same `blocked` semantics for this run.
 *   - other     → null result, caller falls through to the next strategy.
 */

const BASE = "https://api.hunter.io/v2";

export interface HunterFinderResult {
    email: string;
    score: number | null;        // 0-100 confidence
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    seniority: string | null;
    department: string | null;
    verification_status: string | null; // "valid" | "accept_all" | "webmail" | "invalid" | …
    linkedin: string | null;
    phone: string | null;
}

export interface HunterDomainResult {
    organization: string | null;
    domain: string | null;
    emails: Array<{
        value: string;
        confidence: number | null;
        first_name: string | null;
        last_name: string | null;
        position: string | null;
        seniority: string | null;
        linkedin: string | null;
        phone_number: string | null;
    }>;
}

function isBlockingStatus(status: number): boolean {
    return status === 401 || status === 403 || status === 429;
}

export async function findEmail(args: {
    domain: string;
    firstName: string;
    lastName: string;
}): Promise<{ ok: true; result: HunterFinderResult | null } | { ok: false; blocked: boolean; reason: string }> {
    const key = process.env.HUNTER_API_KEY;
    if (!key) return { ok: false, blocked: true, reason: "HUNTER_API_KEY not configured" };

    const url = new URL(`${BASE}/email-finder`);
    url.searchParams.set("domain", args.domain);
    url.searchParams.set("first_name", args.firstName);
    url.searchParams.set("last_name", args.lastName);
    url.searchParams.set("api_key", key);

    let res: Response;
    try {
        res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
        return { ok: false, blocked: false, reason: e instanceof Error ? e.message : "fetch_failed" };
    }

    if (isBlockingStatus(res.status)) {
        return { ok: false, blocked: true, reason: `hunter_${res.status}` };
    }
    if (!res.ok) {
        return { ok: false, blocked: false, reason: `hunter_${res.status}` };
    }

    const body = await res.json().catch(() => ({}));
    const d = body?.data;
    if (!d?.email) return { ok: true, result: null };

    return {
        ok: true,
        result: {
            email: d.email,
            score: typeof d.score === "number" ? d.score : null,
            first_name: d.first_name ?? null,
            last_name: d.last_name ?? null,
            position: d.position ?? null,
            seniority: d.seniority ?? null,
            department: d.department ?? null,
            verification_status: d.verification?.status ?? null,
            linkedin: d.linkedin ?? null,
            phone: d.phone_number ?? null,
        },
    };
}

export async function domainSearch(args: {
    domain: string;
    seniorityFilter?: "executive" | "senior" | "junior";
}): Promise<{ ok: true; result: HunterDomainResult | null } | { ok: false; blocked: boolean; reason: string }> {
    const key = process.env.HUNTER_API_KEY;
    if (!key) return { ok: false, blocked: true, reason: "HUNTER_API_KEY not configured" };

    const url = new URL(`${BASE}/domain-search`);
    url.searchParams.set("domain", args.domain);
    url.searchParams.set("limit", "10");
    if (args.seniorityFilter) url.searchParams.set("seniority", args.seniorityFilter);
    url.searchParams.set("api_key", key);

    let res: Response;
    try {
        res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
        return { ok: false, blocked: false, reason: e instanceof Error ? e.message : "fetch_failed" };
    }

    if (isBlockingStatus(res.status)) {
        return { ok: false, blocked: true, reason: `hunter_${res.status}` };
    }
    if (!res.ok) {
        return { ok: false, blocked: false, reason: `hunter_${res.status}` };
    }

    const body = await res.json().catch(() => ({}));
    const d = body?.data;
    if (!d) return { ok: true, result: null };

    return {
        ok: true,
        result: {
            organization: d.organization ?? null,
            domain: d.domain ?? null,
            emails: (d.emails || []).map((e: Record<string, unknown>) => ({
                value: String(e.value || ""),
                confidence: typeof e.confidence === "number" ? e.confidence : null,
                first_name: (e.first_name as string) ?? null,
                last_name: (e.last_name as string) ?? null,
                position: (e.position as string) ?? null,
                seniority: (e.seniority as string) ?? null,
                linkedin: (e.linkedin as string) ?? null,
                phone_number: (e.phone_number as string) ?? null,
            })),
        },
    };
}

/**
 * Pick the most senior usable contact from a domain-search response. Skips
 * webmail-only matches and prefers CEO/President/Founder over generic VPs.
 */
export function pickBestFromDomain(result: HunterDomainResult | null): HunterDomainResult["emails"][number] | null {
    if (!result?.emails?.length) return null;
    const titleScore = (pos: string | null): number => {
        const p = (pos || "").toLowerCase();
        if (/(^|\b)(ceo|chief executive)\b/.test(p))             return 100;
        if (/(^|\b)(president)\b/.test(p))                       return 90;
        if (/(^|\b)(owner|founder|principal|managing director)\b/.test(p)) return 85;
        if (/(^|\b)(coo|cfo|cto|chief)\b/.test(p))               return 75;
        if (/(^|\b)(vice president|vp)\b/.test(p))               return 60;
        if (/(^|\b)(director)\b/.test(p))                        return 50;
        if (/(^|\b)(manager)\b/.test(p))                         return 30;
        return 10;
    };
    return [...result.emails]
        .map(e => ({ e, s: titleScore(e.position) + (typeof e.confidence === "number" ? e.confidence / 10 : 0) }))
        .sort((a, b) => b.s - a.s)
        .map(x => x.e)[0] || null;
}

/**
 * Convenience wrapper for the cascade: split a "John Q. Smith" name into a
 * first + last that Hunter expects. Returns null if we can't get both halves.
 */
export function splitNameForHunter(full: string | null | undefined): { first: string; last: string } | null {
    if (!full) return null;
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    return { first: parts[0], last: parts[parts.length - 1] };
}
