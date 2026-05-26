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
    const head = text.slice(0, 800).toLowerCase();
    return (
        head.includes("enable javascript and cookies") ||
        head.includes("checking your browser") ||
        head.includes("cf-error") ||
        head.includes("please sign in") ||
        head.includes("please log in") ||
        head.includes("login is required") ||
        head.includes("access denied") ||
        head.includes("session has expired") ||
        // Detect login-wall chrome where the page renders a header + login
        // form but no real body. Multiple of these signals together = chrome.
        ((head.match(/log\s*in/g) || []).length >= 2 && head.includes("register")) ||
        // Bidexpress / ProcureWare / DemandStar — common nav-only renders
        // where the first 500 chars are timezone selectors or month-pickers.
        head.includes("international date line west") ||
        head.includes("coordinated universal time") ||
        head.includes("aleutian islands")
    );
}

// Score how "boilerplate" the captured text looks — anything > 0.4 is mostly
// navigation chrome, not real bid scope. Cheap heuristic: ratio of "stop-word
// nav phrases" to total length.
function chromeScore(text: string): number {
    const sample = text.slice(0, 2000).toLowerCase();
    const navPhrases = [
        "log in", "sign in", "register", "home", "about", "contact",
        "skip to", "main content", "menu", "search", "language",
        "vendor portal", "supplier portal", "bid portal",
        "privacy policy", "terms of service", "cookies",
    ];
    let hits = 0;
    for (const p of navPhrases) {
        const matches = sample.match(new RegExp(p, "g"));
        if (matches) hits += matches.length;
    }
    return hits / Math.max(sample.length / 100, 1);
}

// Pull <meta name="description"> / <meta property="og:description"> — these
// are portal-curated summaries and usually beat a body-strip for quality.
function extractMetaDescription(html: string): string | null {
    for (const re of [
        /<meta\s+name=["']description["']\s+content=["']([^"']+)/i,
        /<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i,
        /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)/i,
    ]) {
        const m = re.exec(html);
        if (m && m[1] && m[1].length >= 80) return m[1].trim();
    }
    return null;
}

// Generic HTML fetcher — server-rendered portals that ship the bid body
// in the initial HTML. Returns null for SPAs (tiny <body> + JS bundles)
// and bot-blocked responses. Prefers <meta description> when curated.
async function fetchHtmlDescription(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
            signal: AbortSignal.timeout(12000),
            redirect: "follow",
        });
        if (!res.ok) return null;
        const html = await res.text();
        if (html.length < 1500) return null;

        // First try the curated <meta> description — beats body-strip for
        // portals that emit a real summary in head (most state government
        // CMSs do this).
        const meta = extractMetaDescription(html);
        if (meta) return meta.slice(0, 4000);

        const text = htmlToText(html);
        if (text.length < 200) return null;
        if (looksLikeBlocked(text)) return null;
        // Reject heavy navigation/chrome — without this filter the crawler
        // saves "Login Register Skip to main content..." for every login-
        // walled portal (ProcureWare, BidExpress, DemandStar, etc).
        if (chromeScore(text) > 0.35) return null;
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

// Pick "significant words" from a title — 6+ chars, excluding procurement
// stopwords. Used to verify the scrape actually belongs to THIS opportunity
// (not the portal's listing-index page rendered identically for every URL).
function titleAnchors(title: string): string[] {
    // Expanded stopwords — anything that recurs across nearly every portal
    // landing page would otherwise let an index-shell pass the guard.
    const stop = new Set([
        "the", "and", "for", "with", "from", "this", "that", "these", "those",
        "rfp", "rfq", "ifb", "rfi", "bid", "bids", "contract", "services",
        "service", "project", "projects", "request", "proposal", "proposals",
        "invitation", "invitations", "purchase", "purchasing", "purchases",
        "department", "departments", "opportunity", "opportunities",
        "current", "open", "active", "public", "vendor", "vendors", "supplier",
        "suppliers", "solicitation", "solicitations", "procurement", "details",
        "view", "list", "listing", "page", "online", "company", "corporation",
    ]);
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 6 && !stop.has(w))
        .slice(0, 8);
}

// URL-shape check: detail pages usually carry an ID in the path or query
// (numeric, UUID, hex-32, slug w/ digits). Pure index URLs have none.
function urlLooksLikeDetail(url: string): boolean {
    try {
        const u = new URL(url);
        const path = u.pathname + u.search;
        // ID-looking patterns: a docId / project_id / bid_id query param,
        // OR a path segment that's mostly digits / a UUID / a hex blob.
        return (
            /[?&](docid|projectid|project_id|bidid|bid_id|opportunityid|id|noticeid|notice_id)=/i.test(path) ||
            /\/[0-9]{4,}(?:[/?-]|$)/.test(path) ||
            /\/[0-9a-f]{8,}-[0-9a-f]/i.test(path) ||
            /\/[0-9a-f]{16,}/i.test(path)
        );
    } catch {
        return false;
    }
}

// Hard-reject: URLs that obviously point at a LISTING page rather than a
// detail page. Common giveaways: plurals, "current_bids", "opportunities",
// "view-jobs-list", etc. These were sneaking past the title-match guard
// because their LIST contains the target bid title verbatim, so the check
// found anchors and passed.
function urlIsObviousListingPage(url: string): boolean {
    try {
        const lc = (new URL(url)).pathname.toLowerCase();
        return (
            /bidopportunities\.(php|aspx|html?)?$/.test(lc) ||
            /current[-_]bids?\.(php|aspx|html?)?$/.test(lc) ||
            /\/(bid|proposal|solicitation|tender|rfp)s($|\/|\.|-)/.test(lc) && !/\/(bid|proposal)s?\/[0-9a-z]{6,}/.test(lc) ||
            /\/bid[-_]and[-_]proposal[-_]opportunities/.test(lc) ||
            /\/viewjoblist/.test(lc) ||
            /\/jobs[-_]for[-_]bid/.test(lc) ||
            /\/(all|active|open|current)[-_]?(bids?|opportunities|solicitations)/.test(lc) ||
            (/\/opportunities$/.test(lc) || /\/opportunities\/?(?:\?|$)/.test(lc))
        );
    } catch {
        return false;
    }
}

function scrapeMentionsTitle(text: string, title: string, url: string): boolean {
    const anchors = titleAnchors(title);
    if (anchors.length === 0) return true; // can't verify → don't reject
    const lc = text.toLowerCase();
    let hits = 0;
    for (const a of anchors) {
        if (lc.includes(a)) hits++;
    }
    // Require 50%+ of distinctive anchors when URL looks like an index
    // (no ID), 30%+ when URL looks like a real detail page. Floor at 2
    // hits for non-trivial titles.
    const isDetailUrl = urlLooksLikeDetail(url);
    const ratio = hits / anchors.length;
    if (isDetailUrl) {
        return hits >= 1 && ratio >= 0.3;
    }
    return hits >= 2 && ratio >= 0.5;
}

/**
 * Top-level dispatcher. Routes to the right scraper based on URL host and
 * any hints in raw_json. Returns null on any failure — caller leaves the
 * existing description alone.
 */
export async function fetchSledDescription(args: {
    link: string;
    title?: string;
    rawJson?: Record<string, unknown> | null;
    sourcePrefix?: string;
}): Promise<DescriptionResult | null> {
    const { link, title, rawJson, sourcePrefix } = args;
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

    // Hard URL filter: when the link is clearly a listing-page (TNTech's
    // /purchasing/bidopportunities.php, Ingham's /current_bids.php, UK's
    // /bid-and-proposal-opportunities, IU's /viewjoblist…), no scrape we
    // can do here will give us the per-bid scope — refuse up front. These
    // URLs are usually the link the upstream RSS feed publishes when the
    // per-bid page sits behind a vendor login.
    if (urlIsObviousListingPage(link)) return null;

    // Default: server-rendered HTML strip.
    const text = await fetchHtmlDescription(link);
    if (!text) return null;
    // Title-mention sanity check: if the scrape doesn't mention any
    // significant title word, we probably hit a portal index/listing page
    // (SPA serving the same shell for every URL — Cleveland, etc).
    if (title && !scrapeMentionsTitle(text, title, link)) return null;
    return { description: text, source: "html-generic" };
}
