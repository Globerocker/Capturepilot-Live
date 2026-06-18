/**
 * Cron / on-demand: CONTRACTOR WEBSITE DISCOVERY lane.
 *
 * Reaches the ~50% of contractors that are un-enriched purely because they have
 * NO website to crawl (website IS NULL AND business_url IS NULL). For each such
 * contractor we Brave-search the company name (+ state), pick the OFFICIAL
 * company website from the results — rejecting directories, social networks,
 * government, and review/aggregator hosts, and validating that the chosen host
 * shares a name token with the company so we don't attach a wrong site — and
 * write it to contractors.website. We then reset the QC claim state
 * (qc_enriched=false, qc_claimed_at=null) so the existing
 * enrich_contractors_quickcheck lane crawls + LLM-extracts the new site.
 *
 * Every processed row gets website_discovery_attempted_at stamped (found or
 * not) so we never re-search the same no-site row forever (migration 184).
 *
 * Prioritized by federal_awards_count DESC NULLS LAST — paying-grade award
 * holders first (~998 un-enriched award holders in the candidate set).
 *
 * Guarded (guardCron). Requires BRAVE_SEARCH_API_KEY.
 *
 * Returns { ok, scanned, websites_found, queued_for_enrich }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAVE_WEB_URL = "https://api.search.brave.com/res/v1/web/search";

// Re-search a no-site row at most this often (a stamped row that still has no
// website is reconsidered after the cooldown — Brave coverage improves over time).
const RESEARCH_COOLDOWN_DAYS = 30;

interface BraveResult {
    url: string;
    title: string;
    snippet: string;
}

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) {
                const idx = i++;
                out[idx] = await fn(items[idx]);
            }
        }),
    );
    return out;
}

// ─── Brave web search (same shape as the cockpit research lane) ──────────────

async function braveSearch(query: string, count = 10): Promise<BraveResult[]> {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return [];
    try {
        const url = `${BRAVE_WEB_URL}?q=${encodeURIComponent(query)}&count=${count}`;
        const res = await fetch(url, {
            headers: { "X-Subscription-Token": key, Accept: "application/json" },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[discover-website] brave ${res.status} ${res.statusText} for "${query}"`);
            return [];
        }
        const payload: any = await res.json();
        const items: any[] = payload?.web?.results || [];
        return items
            .map((r) => ({
                url: String(r?.url || ""),
                title: String(r?.title || ""),
                snippet: String(r?.description || r?.snippet || ""),
            }))
            .filter((r) => r.url);
    } catch (err) {
        console.warn(`[discover-website] brave exception for "${query}":`, err instanceof Error ? err.message : err);
        return [];
    }
}

// ─── Official-website selection ──────────────────────────────────────────────

// Hosts that are NEVER the company's own site: directories, aggregators,
// socials, government, marketplaces, news, review sites. Matched on the
// registrable-ish host (substring), so e.g. "linkedin." catches all TLDs.
const REJECT_HOST_RE = new RegExp(
    [
        // government / official data
        "sam\\.gov", "usaspending", "fpds\\.gov", "gsa\\.gov", "dnb\\.com", "dunsnumber",
        "highergov", "govtribe", "govspend", "usfcr", "fbo\\.gov", "grants\\.gov",
        // socials
        "linkedin\\.", "facebook\\.", "instagram\\.", "twitter\\.", "x\\.com",
        "youtube\\.", "tiktok\\.", "pinterest\\.", "reddit\\.", "t\\.me", "medium\\.com",
        // directories / aggregators / reviews
        "bbb\\.org", "yelp\\.", "bloomberg\\.com", "glassdoor\\.", "indeed\\.",
        "wikipedia\\.", "opencorporates", "buzzfile", "manta\\.com", "zoominfo",
        "rocketreach", "crunchbase", "clutch\\.co", "thomasnet", "yellowpages",
        "bizapedia", "corporationwiki", "dnb\\b", "owler\\.com", "apollo\\.io",
        "trustpilot\\.", "angi\\.com", "houzz\\.com", "mapquest", "google\\.com",
        "g\\.page", "business\\.google", "amazon\\.", "ebay\\.", "etsy\\.",
        "leadiq", "signalhire", "datanyze", "lusha", "hoovers", "spoke\\.com",
        // generic hosts / blogs that are never a company site
        "wordpress\\.com", "blogspot\\.", "wixsite\\.com", "godaddysites\\.com",
        "weebly\\.com", "squarespace\\.com", "github\\.io", "issuu\\.com",
        "scribd\\.com", "slideshare", "vimeo\\.", "prnewswire", "businesswire",
        "nytimes\\.com", "forbes\\.com", "reuters\\.com", "apnews\\.com",
    ].join("|"),
    "i",
);

// Words common to many company names that carry no identifying signal — never
// use these alone to "match" a host to a company.
const STOP_TOKENS = new Set([
    "the", "and", "of", "for", "a", "an", "in", "to",
    "inc", "incorporated", "llc", "lp", "llp", "plc", "co", "corp", "corporation",
    "company", "group", "holdings", "holding", "enterprises", "enterprise",
    "services", "service", "solutions", "solution", "systems", "system",
    "technologies", "technology", "tech", "international", "intl", "global",
    "consulting", "consultants", "associates", "partners", "partnership",
    "industries", "industrial", "construction", "contracting", "contractors",
    "management", "professional", "professionals", "us", "usa", "national",
    "american", "america", "ltd", "limited", "pllc", "pc",
]);

function hostOf(url: string): string {
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

function rootUrlOf(url: string): string {
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        return `${u.protocol}//${u.hostname.replace(/^www\./, "")}`;
    } catch {
        return "";
    }
}

/** Identifying name tokens (alpha, length >= 3, not a stop word). */
function nameTokens(name: string): string[] {
    return Array.from(
        new Set(
            (name || "")
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .split(/\s+/)
                .map((t) => t.trim())
                .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t) && !/^\d+$/.test(t)),
        ),
    );
}

/** The host's leading label, alpha-collapsed (e.g. "acme-corp.com" -> "acmecorp"). */
function hostStem(host: string): string {
    const label = host.split(".")[0] || "";
    return label.replace(/[^a-z0-9]/g, "");
}

/**
 * Score how confidently a result host belongs to the company. Requires real
 * token overlap between the company name and the host stem (or the result
 * title) — conservative: better no-website than a wrong site.
 *
 * Returns a number; <= 0 means "do not use".
 */
function matchConfidence(company: string, result: BraveResult): number {
    const host = hostOf(result.url);
    if (!host || REJECT_HOST_RE.test(host)) return 0;
    if (host.endsWith(".gov") || host.endsWith(".mil")) return 0;

    const tokens = nameTokens(company);
    if (tokens.length === 0) return 0;

    const stem = hostStem(host);
    if (!stem || stem.length < 3) return 0;

    const titleLc = (result.title || "").toLowerCase();
    const collapsedCompany = tokens.join("");

    let score = 0;

    // Strongest signal: host stem contains the whole collapsed company name, or
    // the collapsed company name contains the host stem (acronym/short form).
    if (collapsedCompany.length >= 4 && stem.includes(collapsedCompany)) score += 6;
    else if (stem.length >= 4 && collapsedCompany.includes(stem)) score += 4;

    // Per-token overlap with the host stem.
    let hostTokenHits = 0;
    for (const t of tokens) {
        if (stem.includes(t)) hostTokenHits++;
    }
    score += hostTokenHits * 2;

    // First (usually most identifying) token in the host stem is a good sign.
    if (tokens[0] && stem.includes(tokens[0])) score += 1;

    // Title mentions the company tokens — supportive but weaker (titles are noisy).
    let titleHits = 0;
    for (const t of tokens) {
        if (titleLc.includes(t)) titleHits++;
    }
    if (titleHits >= Math.min(2, tokens.length)) score += 1;

    // Require at least one real host-stem token hit (or a whole-name containment).
    // A title-only match is too weak to attach a website to.
    if (hostTokenHits === 0 && !(collapsedCompany.length >= 4 && stem.includes(collapsedCompany))) {
        return 0;
    }

    return score;
}

/** Pick the official website URL from Brave results, or null. Conservative. */
function pickOfficialWebsite(company: string, results: BraveResult[]): string | null {
    let best: { url: string; score: number } | null = null;
    for (const r of results) {
        const score = matchConfidence(company, r);
        if (score <= 0) continue;
        const root = rootUrlOf(r.url);
        if (!root) continue;
        if (!best || score > best.score) best = { url: root, score };
    }
    // Minimum confidence floor: at least one solid host-token match.
    if (best && best.score >= 2) return best.url;
    return null;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    if (!process.env.BRAVE_SEARCH_API_KEY) {
        return NextResponse.json({ ok: false, error: "BRAVE_SEARCH_API_KEY not set" }, { status: 200 });
    }

    const params = new URL(req.url).searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "25", 10)));
    const db = svc();

    const cooldownIso = new Date(Date.now() - RESEARCH_COOLDOWN_DAYS * 864e5).toISOString();

    // Candidate set: not enriched, no website at all, never (or long-ago) searched.
    // Award holders first (paying-grade), then by oldest/never-attempted.
    const { data: rows, error } = await db
        .from("contractors")
        .select("id, company_name, state, federal_awards_count, website, business_url, website_discovery_attempted_at")
        .neq("qc_enriched", true)
        .is("website", null)
        .is("business_url", null)
        .or(`website_discovery_attempted_at.is.null,website_discovery_attempted_at.lt.${cooldownIso}`)
        .order("federal_awards_count", { ascending: false, nullsFirst: false })
        .order("website_discovery_attempted_at", { ascending: true, nullsFirst: true })
        .limit(limit);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!rows?.length) {
        return NextResponse.json({ ok: true, scanned: 0, websites_found: 0, queued_for_enrich: 0 });
    }

    const nowIso = new Date().toISOString();
    const t0 = Date.now();
    let websitesFound = 0;
    let queuedForEnrich = 0;

    // Concurrency 3 keeps us comfortably under Brave's free-tier rate limit while
    // still draining a batch of 25 well inside maxDuration.
    await mapLimit(rows as any[], 3, async (c) => {
        const company = String(c.company_name || "").trim();
        const state = String(c.state || "").trim();

        const patch: any = { website_discovery_attempted_at: nowIso };

        if (company) {
            try {
                // Primary query scoped by state; fallback without state if nothing usable.
                let results = await braveSearch(`"${company}"${state ? ` ${state}` : ""}`, 10);
                let website = pickOfficialWebsite(company, results);
                if (!website && state) {
                    results = await braveSearch(`"${company}"`, 10);
                    website = pickOfficialWebsite(company, results);
                }

                if (website) {
                    // Only write the site when still empty (never clobber), and
                    // reset the QC claim so enrich_contractors_quickcheck picks it up.
                    patch.website = website;
                    patch.qc_enriched = false;
                    patch.qc_claimed_at = null;
                    websitesFound++;
                    queuedForEnrich++;
                }
            } catch (e) {
                console.warn(`[discover-website] failed for ${company}:`, e instanceof Error ? e.message : e);
            }
        }

        // Guard the write so a stale row can't clobber a website that another
        // worker/lane already filled in between our read and write.
        await db.from("contractors").update(patch).eq("id", c.id).is("website", null);
    });

    return NextResponse.json({
        ok: true,
        scanned: rows.length,
        websites_found: websitesFound,
        queued_for_enrich: queuedForEnrich,
        elapsed_ms: Date.now() - t0,
    });
}
