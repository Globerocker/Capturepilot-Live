/**
 * Per-source SLED description deep-fetcher.
 *
 * Most SLED ingest paths land a row with title + agency + close-date but
 * NO real bid text — the body sits in a PDF behind the portal's vendor
 * login. Where the portal exposes a public detail HTML page or a JSON
 * endpoint, we can scrape it and fill opportunities.description so the
 * match cards (and the AI summary generator) have something to chew on.
 *
 * Each source-specific scraper is best-effort: when the upstream fails
 * (CF challenge, login wall, 404), we return null and the caller leaves
 * the row alone — never overwrites with garbage. The generic fallback
 * grabs main-content HTML and strips it, which works for vendor portals
 * with server-rendered HTML (BidNet, BidExpress, NY-SCR, most state
 * government sites). It does NOT work for SPAs (Bonfire portal pages,
 * OpenGov procurement, modern React/Vue portals).
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface DescriptionResult {
    /** Plain-text description, normalized whitespace. */
    description: string;
    /** Which scraper produced it — for telemetry / debugging. */
    source: "bonfire-json" | "la-ramp-aura" | "html-generic" | "skip-known-empty";
}

// Strip script/style/nav/footer/header before extracting text. Keeps the
// main bid body. Cheap regex-based — no DOM parser dep needed.
function htmlToText(html: string): string {
    let s = html;
    s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
    s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
    s = s.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
    s = s.replace(/<header[\s\S]*?<\/header>/gi, " ");
    s = s.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
    s = s.replace(/<!--[\s\S]*?-->/g, " ");
    s = s.replace(/<[^>]+>/g, " ");
    s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
    s = s.replace(/\s+/g, " ").trim();
    return s;
}

// Sniff for the obvious "this is a login wall / robot challenge" pages so we
// don't save a 5KB blob of "Enable JavaScript and cookies to continue".
function looksLikeBlocked(text: string): boolean {
    const head = text.slice(0, 500).toLowerCase();
    return (
        head.includes("enable javascript and cookies") ||
        head.includes("checking your browser") ||
        head.includes("cf-error") ||
        head.includes("please sign in") ||
        head.includes("login is required") ||
        head.includes("access denied")
    );
}

// Generic HTML fetcher — server-rendered portals that ship the bid body
// in the initial HTML. Returns null for SPAs (tiny <body> + JS bundles)
// and bot-blocked responses.
async function fetchHtmlDescription(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
            signal: AbortSignal.timeout(12000),
            redirect: "follow",
        });
        if (!res.ok) return null;
        const html = await res.text();
        if (html.length < 1500) return null; // SPA shells are usually < 2KB
        const text = htmlToText(html);
        if (text.length < 200) return null;
        if (looksLikeBlocked(text)) return null;
        return text.slice(0, 4000);
    } catch {
        return null;
    }
}

// Bonfire JSON detail — uses the same JSON wire format we documented in
// lib/parsers/bonfire-json.ts, but the project DETAIL endpoint requires
// the PrivateProjectID (32-hex). Raw_json on the row carries this from
// the listing ingest, so we can look it up cheaply.
async function fetchBonfireDescription(
    portalHost: string,
    privateProjectId: string,
): Promise<string | null> {
    try {
        const url = `https://${portalHost}/PublicPortal/getPublicProjectDetailSectionData?projectId=${privateProjectId}`;
        const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const j = await res.json() as { payload?: { project?: Record<string, unknown> } };
        const project = j.payload?.project;
        if (!project) return null;
        // Bonfire stores the body under various fields depending on the
        // tenant's template — fall through the most common ones in order
        // of "human-readable bid body".
        const candidates: string[] = [];
        for (const k of ["BidDescription", "ProjectDescription", "Description", "Scope", "Summary"]) {
            const v = project[k];
            if (typeof v === "string" && v.trim().length >= 50) candidates.push(v.trim());
        }
        if (candidates.length === 0) return null;
        const text = htmlToText(candidates.join("\n\n"));
        return text.slice(0, 4000);
    } catch {
        return null;
    }
}

/**
 * Top-level dispatcher. Routes to the right scraper based on URL host and
 * any hints in raw_json. Returns null on any failure — caller leaves the
 * existing description alone.
 */
export async function fetchSledDescription(args: {
    link: string;
    rawJson?: Record<string, unknown> | null;
    sourcePrefix?: string;
}): Promise<DescriptionResult | null> {
    const { link, rawJson, sourcePrefix } = args;
    let host: string;
    try {
        host = new URL(link).hostname.toLowerCase();
    } catch {
        return null;
    }

    // Known-empty sources — skip cheaply rather than burning a fetch.
    // Chicago contracts + NYC CROL are awards/contract archives, not bid
    // listings; their detail pages are just metadata tables with no scope
    // narrative. (Their match-pool entries should be hard-filtered, not
    // enriched — but skip the fetch either way.)
    if (sourcePrefix?.startsWith("socrata-chicago-contracts")) {
        return { description: "", source: "skip-known-empty" };
    }
    if (sourcePrefix?.startsWith("socrata-nyc-crol")) {
        return { description: "", source: "skip-known-empty" };
    }

    // Bonfire — use the JSON detail endpoint when we have the PrivateProjectID.
    if (host.endsWith(".bonfirehub.com")) {
        const bonfire = (rawJson?.bonfire as Record<string, unknown> | undefined) || {};
        const pid = (bonfire.private_project_id as string) || (rawJson?.private_project_id as string);
        if (pid && /^[0-9a-f]{32}$/i.test(pid)) {
            const text = await fetchBonfireDescription(host, pid);
            if (text) return { description: text, source: "bonfire-json" };
        }
        // Fall through to HTML — Bonfire detail pages are SPAs but the meta
        // description tag often carries the project name + abstract.
    }

    // LA RAMP — Salesforce Aura, handled by lib/parsers/la-ramp.ts. Skip
    // here; the dedicated enrich_la_ramp cron handles description writeback.
    if (host === "www.rampla.org" || host === "rampla.org") {
        return null;
    }

    // Default: server-rendered HTML strip.
    const text = await fetchHtmlDescription(link);
    if (text) return { description: text, source: "html-generic" };
    return null;
}
