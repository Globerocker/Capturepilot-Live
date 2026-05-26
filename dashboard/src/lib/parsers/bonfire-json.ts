/**
 * Bonfire JSON-API client.
 *
 * Per docs/source-analysis/BONFIRE.md: every Bonfire portal at
 * <slug>.bonfirehub.com exposes an UNDOCUMENTED JSON endpoint that
 * the public SPA hits to populate the list view. It serves
 * application/json anonymously (no CF challenge, unlike the
 * detail-page routes) and returns richer fields than RSS.
 *
 * Endpoints:
 *   GET /PublicPortal/getOpenPublicOpportunitiesSectionData?organizationId=N
 *   GET /PublicPortal/getPastPublicOpportunitiesSectionData?organizationId=N
 *
 * Response: {
 *   data: [
 *     {
 *       Title, ProjectName, ReferenceNumber,
 *       ProjectId, PrivateProjectID,
 *       ProjectStatusID, ProjectStatusName,
 *       DepartmentId, DepartmentName,
 *       PublicOpen, PublicClose,
 *       IsPublicAward,
 *       ...
 *     }
 *   ]
 * }
 *
 * Each Bonfire tenant has a numeric OrganizationId hard-coded in the
 * portal landing page (`var organizationId = "N";`). We've documented
 * known IDs in the research report; new tenants are auto-discoverable
 * by parsing the /portal/ HTML.
 *
 * Robots.txt sets Disallow: / on most tenants — this client is
 * permissive (we identify ourselves in UA + cap RPS) but the operator
 * should consider legal review before scaling.
 */

const UA = "CapturePilot/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)";

export interface BonfireListing {
    title: string;
    reference_number: string | null;
    project_id: number | null;
    private_project_id: string | null;          // hex32, stable per-project key
    department_name: string | null;
    public_open: string | null;                 // ISO
    public_close: string | null;                // ISO
    status_id: number | null;
    status_name: string | null;
    is_public_award: boolean;
    raw: Record<string, unknown>;
}

export async function discoverOrganizationId(args: {
    portalHost: string;                          // "fairfaxcounty.bonfirehub.com"
    timeoutMs?: number;
}): Promise<number | null> {
    try {
        const res = await fetch(`https://${args.portalHost}/portal/`, {
            headers: { "User-Agent": UA, Accept: "text/html" },
            signal: AbortSignal.timeout(args.timeoutMs ?? 8000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/organizationId\s*=\s*["']?(\d+)["']?/i);
        return m ? parseInt(m[1], 10) : null;
    } catch {
        return null;
    }
}

async function fetchSection(args: {
    portalHost: string;
    organizationId: number;
    section: "Open" | "Past";
    timeoutMs?: number;
}): Promise<BonfireListing[]> {
    const path = args.section === "Open"
        ? "/PublicPortal/getOpenPublicOpportunitiesSectionData"
        : "/PublicPortal/getPastPublicOpportunitiesSectionData";
    const url = `https://${args.portalHost}${path}?organizationId=${args.organizationId}`;
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(args.timeoutMs ?? 12000),
        });
        if (!res.ok) return [];
        const j = await res.json() as { data?: Array<Record<string, unknown>> };
        const rows = Array.isArray(j.data) ? j.data : [];
        return rows.map((r) => mapRow(r));
    } catch {
        return [];
    }
}

function asString(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
    return null;
}

function asIso(v: unknown): string | null {
    const s = asString(v);
    if (!s) return null;
    const t = new Date(s).getTime();
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString();
}

function mapRow(r: Record<string, unknown>): BonfireListing {
    return {
        title: asString(r.Title) || asString(r.ProjectName) || "",
        reference_number: asString(r.ReferenceNumber),
        project_id: typeof r.ProjectId === "number" ? r.ProjectId : null,
        private_project_id: asString(r.PrivateProjectID) || asString(r.PrivateProjectId),
        department_name: asString(r.DepartmentName),
        public_open: asIso(r.PublicOpen),
        public_close: asIso(r.PublicClose),
        status_id: typeof r.ProjectStatusID === "number" ? r.ProjectStatusID : null,
        status_name: asString(r.ProjectStatusName),
        is_public_award: Boolean(r.IsPublicAward),
        raw: r,
    };
}

export async function fetchBonfireOpen(args: {
    portalHost: string;
    organizationId: number;
    timeoutMs?: number;
}): Promise<BonfireListing[]> {
    return fetchSection({ ...args, section: "Open" });
}

export async function fetchBonfirePast(args: {
    portalHost: string;
    organizationId: number;
    timeoutMs?: number;
}): Promise<BonfireListing[]> {
    return fetchSection({ ...args, section: "Past" });
}
