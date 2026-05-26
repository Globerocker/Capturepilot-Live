/**
 * Bonfire JSON-API client.
 *
 * Every Bonfire portal at <slug>.bonfirehub.com exposes an undocumented
 * JSON endpoint that the public SPA hits to populate the list view.
 *
 * Endpoints:
 *   GET /PublicPortal/getOpenPublicOpportunitiesSectionData?organizationId=N
 *   GET /PublicPortal/getPastPublicOpportunitiesSectionData?organizationId=N
 *
 * Actual shape (verified 2026-05-26 against Fairfax/Detroit/CPS):
 *   {
 *     success: 1,
 *     message: "Success",
 *     payload: {
 *       projects: {
 *         "<projectId>": {
 *           ProjectID, PrivateProjectID, ReferenceID,
 *           ProjectStatusID, ProjectSubStatusID, ProjectVisibilityID,
 *           ProjectName, DateClose, DepartmentID,
 *           IsPublicAward (past only),
 *         }
 *       },
 *       departments: { "<deptId>": { DepartmentName } } | [],
 *       ...
 *     }
 *   }
 *
 * Numeric fields are returned as strings. PublicOpen is not exposed —
 * we only get DateClose. Status/department names require lookups.
 *
 * Each Bonfire tenant has a numeric OrganizationId hard-coded in the
 * portal HTML (`var organizationId = "N";`); we auto-discover it.
 */

const UA = "CapturePilot/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)";

export interface BonfireListing {
    title: string;
    reference_number: string | null;
    project_id: number | null;
    private_project_id: string | null;          // hex32, stable per-project key
    department_name: string | null;
    public_open: string | null;                 // never exposed by API
    public_close: string | null;                // ISO, from DateClose
    status_id: number | null;
    status_name: string | null;
    is_public_award: boolean;
    raw: Record<string, unknown>;
}

// Status names — Bonfire returns numeric IDs only; mapping is consistent
// across tenants (verified Fairfax + Detroit). Keep null for unknown values
// so we don't fabricate.
const STATUS_NAMES: Record<string, string> = {
    "1": "Draft",
    "2": "Open",
    "3": "Evaluation",
    "4": "Awarded",
    "5": "Closed",
};

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

interface BonfireApiResponse {
    success?: number | boolean;
    payload?: {
        projects?: Record<string, Record<string, unknown>>;
        departments?: Record<string, { DepartmentName?: string }> | unknown[];
    };
}

function buildDepartmentLookup(deps: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!deps || Array.isArray(deps) || typeof deps !== "object") return out;
    for (const [id, val] of Object.entries(deps as Record<string, { DepartmentName?: unknown }>)) {
        if (val && typeof val.DepartmentName === "string") out[id] = val.DepartmentName;
    }
    return out;
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
        const j = await res.json() as BonfireApiResponse;
        const projects = j.payload?.projects;
        if (!projects || typeof projects !== "object") return [];
        const deptLookup = buildDepartmentLookup(j.payload?.departments);
        return Object.values(projects).map((r) => mapRow(r, deptLookup));
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

function asInt(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

// Bonfire returns "YYYY-MM-DD HH:MM:SS" without timezone; treat as UTC
// (matches the value the portal displays back to users).
function asIso(v: unknown): string | null {
    const s = asString(v);
    if (!s) return null;
    const candidate = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)
        ? s.replace(" ", "T") + "Z"
        : s;
    const t = new Date(candidate).getTime();
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString();
}

function mapRow(r: Record<string, unknown>, deptLookup: Record<string, string>): BonfireListing {
    const statusIdStr = asString(r.ProjectStatusID);
    const deptId = asString(r.DepartmentID);
    return {
        title: asString(r.ProjectName) || asString(r.Title) || "",
        reference_number: asString(r.ReferenceID) || asString(r.ReferenceNumber),
        project_id: asInt(r.ProjectID) ?? asInt(r.ProjectId),
        private_project_id: asString(r.PrivateProjectID) || asString(r.PrivateProjectId),
        department_name: deptId ? (deptLookup[deptId] ?? null) : null,
        public_open: null,
        public_close: asIso(r.DateClose) || asIso(r.PublicClose),
        status_id: asInt(r.ProjectStatusID),
        status_name: statusIdStr ? (STATUS_NAMES[statusIdStr] ?? null) : null,
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
