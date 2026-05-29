/**
 * OpenGov Procurement JSON-API client.
 *
 * STATUS 2026-05-26: PARTIALLY BLOCKED.
 *   - GET /government (tenants directory) works → 545 tenants confirmed
 *   - The project-listing endpoints documented in the research file
 *     (e.g. /government/{slug}/project/public) all return 404 in prod.
 *   - Direct portal HTML (procurement.opengov.com/portal/<code>) returns
 *     403 Cloudflare-challenge to non-browser clients.
 *   - Decompiling the SPA bundle shows the public site loads projects
 *     via GraphQL at /api/v1/po/graphql — the documented REST surface
 *     is private/internal.
 *   The cron writes ok_empty harmlessly until we either reverse-engineer
 *   the GraphQL query or wire a headless-browser path.
 *
 * Three documented endpoints (only the first verifiably works):
 *   GET  /government                       → 545+ tenants index ✓
 *   POST /government/{slug}/project/public → 404 in prod ✗
 *   GET  /project/{id}                     → 404 in prod ✗
 *
 * Category systems: hardcoded — NIGP:100, NAICS:200, UNSPSC:300. ~75%
 * of tenants use NIGP; the caller can read `categorySetId` and apply
 * a NIGP→NAICS crosswalk if needed (once project listings are reachable).
 */

const API_BASE = "https://api.procurement.opengov.com/api/v1";
const PORTAL_ORIGIN = "https://procurement.opengov.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function commonHeaders(): Record<string, string> {
    return {
        "User-Agent": UA,
        Origin: PORTAL_ORIGIN,
        Referer: `${PORTAL_ORIGIN}/`,
        Accept: "application/json",
    };
}

export interface OpenGovTenant {
    slug: string;
    name: string;
    state: string | null;
    country: string | null;
    raw: Record<string, unknown>;
}

/**
 * Pull the full tenant directory. ~545 governments as of May 2026.
 * Used for discovery — pick slugs to add to our rss_sources table.
 */
export async function listOpenGovTenants(timeoutMs = 20000): Promise<OpenGovTenant[]> {
    try {
        const res = await fetch(`${API_BASE}/government`, {
            headers: commonHeaders(),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return [];
        const j = await res.json() as { data?: Array<Record<string, unknown>> };
        const rows = Array.isArray(j.data) ? j.data : Array.isArray(j) ? (j as unknown as Array<Record<string, unknown>>) : [];
        return rows.map((r) => {
            const addr = (r.address as Record<string, unknown> | undefined) || {};
            return {
                slug: (r.slug as string) || (r.code as string) || "",
                name: (r.name as string) || "",
                state: (addr.state as string) || (r.state as string) || null,
                country: (addr.country as string) || (r.country as string) || null,
                raw: r,
            };
        }).filter((t) => t.slug && t.name);
    } catch {
        return [];
    }
}

export interface OpenGovListing {
    project_id: number;
    title: string;
    project_number: string | null;
    department: string | null;
    status: string | null;
    posted_at: string | null;     // ISO
    close_at: string | null;      // ISO
    category_id: string | null;
    category_set_id: number | null;   // 100=NIGP, 200=NAICS, 300=UNSPSC
    raw: Record<string, unknown>;
}

/**
 * Fetch open projects for a tenant. `tenantSlug` is the path segment
 * after /portal/ (e.g. "phoenix", "saccounty"). Returns paginated
 * listings; default page size 50.
 */
export async function fetchOpenGovProjects(args: {
    tenantSlug: string;
    page?: number;
    pageSize?: number;
    timeoutMs?: number;
}): Promise<OpenGovListing[]> {
    try {
        // OpenGov renamed fields in their 2025 procurement API rewrite:
        //   status filter:   "Published" → "open"  (lowercase)
        //   sort field:      publishedAt → releaseProjectDate
        //   field title:     title (unchanged)
        //   field ref num:   projectNumber → financialId
        //   field posted:    publishedAt → releaseProjectDate
        //   field deadline:  closeAt → proposalDeadline
        //   field dept:      departmentName → department.name (object)
        // Dropping the explicit status filter entirely — `open` is the
        // default for the public endpoint and including the filter as
        // "Published" returned 500 silently for every tenant.
        // Origin must match a real tenant URL or the API returns 500.
        const body = {
            paging: { page: args.page ?? 0, pageSize: args.pageSize ?? 50 },
        };
        const res = await fetch(`${API_BASE}/government/${encodeURIComponent(args.tenantSlug)}/project/public`, {
            method: "POST",
            headers: {
                ...commonHeaders(),
                "Content-Type": "application/json",
                Referer: `${PORTAL_ORIGIN}/portal/${encodeURIComponent(args.tenantSlug)}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(args.timeoutMs ?? 20000),
        });
        if (!res.ok) return [];
        // 2025 response shape: { count, rows: [...] }. Older shape used data/results.
        const j = await res.json() as {
            count?: number;
            rows?: Array<Record<string, unknown>>;
            data?: Array<Record<string, unknown>>;
            results?: Array<Record<string, unknown>>;
        };
        const rows = j.rows || j.data || j.results || [];
        return rows.map((r) => {
            const dept = (r.department as Record<string, unknown> | undefined) || {};
            return {
                project_id: typeof r.id === "number" ? r.id : Number(r.id) || 0,
                title: (r.title as string) || (r.name as string) || "",
                project_number: (r.financialId as string) || (r.projectNumber as string) || (r.referenceNumber as string) || null,
                department: (dept.name as string) || (r.departmentName as string) || null,
                status: (r.status as string) || null,
                posted_at: (r.releaseProjectDate as string) || (r.publishedAt as string) || (r.postedAt as string) || (r.created_at as string) || null,
                close_at: (r.proposalDeadline as string) || (r.closeAt as string) || (r.closesAt as string) || (r.responseDueAt as string) || null,
                category_id: (r.categoryId as string) || null,
                category_set_id: typeof r.categorySetId === "number" ? r.categorySetId : null,
                raw: r,
            };
        }).filter((p) => p.project_id);
    } catch {
        return [];
    }
}

export interface OpenGovProjectDetail {
    project_id: number;
    title: string;
    description: string | null;
    department: string | null;
    status: string | null;
    posted_at: string | null;
    close_at: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    naics_codes: string[];        // when categorySetId=200, raw category values; else empty
    nigp_codes: string[];          // when categorySetId=100
    attachments: Array<{ name: string; url: string; size_bytes: number | null }>;
    raw: Record<string, unknown>;
}

export async function fetchOpenGovProjectDetail(args: {
    projectId: number;
    timeoutMs?: number;
}): Promise<OpenGovProjectDetail | null> {
    try {
        const res = await fetch(`${API_BASE}/project/${args.projectId}`, {
            headers: commonHeaders(),
            signal: AbortSignal.timeout(args.timeoutMs ?? 20000),
        });
        if (!res.ok) return null;
        const r = await res.json() as Record<string, unknown>;
        const dept = (r.department as Record<string, unknown> | undefined) || {};
        const contact = (r.primaryContact as Record<string, unknown> | undefined) || {};
        const categorySetId = typeof r.categorySetId === "number" ? r.categorySetId : null;
        const cats = Array.isArray(r.categories) ? (r.categories as Array<Record<string, unknown>>) : [];
        const catCodes = cats.map((c) => (c.code as string) || (c.value as string) || "").filter(Boolean);
        const attachments = (Array.isArray(r.attachments) ? r.attachments : []) as Array<Record<string, unknown>>;
        return {
            project_id: typeof r.id === "number" ? r.id : args.projectId,
            title: (r.title as string) || "",
            description: (r.description as string) || (r.scope as string) || null,
            department: (dept.name as string) || null,
            status: (r.status as string) || null,
            posted_at: (r.publishedAt as string) || null,
            close_at: (r.closeAt as string) || (r.responseDueAt as string) || null,
            contact_name: (contact.fullName as string) || (contact.name as string) || null,
            contact_email: (contact.email as string) || null,
            contact_phone: (contact.phone as string) || null,
            naics_codes: categorySetId === 200 ? catCodes : [],
            nigp_codes: categorySetId === 100 ? catCodes : [],
            attachments: attachments.map((a) => ({
                name: (a.name as string) || (a.fileName as string) || "",
                url: (a.url as string) || (a.downloadUrl as string) || "",
                size_bytes: typeof a.size === "number" ? a.size : null,
            })).filter((a) => a.url),
            raw: r,
        };
    } catch {
        return null;
    }
}
