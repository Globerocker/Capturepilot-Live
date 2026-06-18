/**
 * POST /api/admin/cockpit/research — the COMPANY RESEARCH / REVIEW AGENT.
 *
 * Given a contractor_id, runs a public-reputation sweep so the cockpit detail
 * panel can show "what does this firm actually do, and what do people think of
 * it" before an outreach call:
 *
 *   1. Brave WEB search — '"<company>" <state> reviews' (reputation) + a second
 *      '"<company>" <state>' (general presence) query. Collect top result
 *      URLs/titles/snippets.
 *   2. Pick the 2-3 most relevant result pages (Google Business / Yelp / BBB /
 *      Clutch / company site / news) and render them to markdown via the
 *      existing firecrawl/jina cascade (best-effort; skip failures).
 *   3. OpenAI structured-output extraction → { overall_sentiment, rating,
 *      reviews_count, summary, what_they_do, sources[] }.
 *   4. Persist: contractors.google_rating (when found),
 *      contractors.google_reviews_count, contractors.research_findings (full
 *      extraction + researched_at).
 *
 * Resilient by design — Brave, crawl, and OpenAI are each independently
 * try/caught. If BRAVE_SEARCH_API_KEY is unset we bail early with a clear
 * error (search is the whole point of the agent). A missing OPENAI_API_KEY
 * degrades to a snippet-only summary so the panel still shows something.
 *
 * Admin-gated via assertAdmin(). Service client for the contractor read/write.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { assertAdmin } from "@/lib/auth-admin";
import { scrapePage } from "@/lib/quick-checker/firecrawl";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const BRAVE_WEB_URL = "https://api.search.brave.com/res/v1/web/search";
const RESEARCH_MODEL = process.env.QUICK_CHECKER_MODEL || "gpt-4o-mini";

interface BraveResult {
    url: string;
    title: string;
    snippet: string;
}

interface ResearchSource {
    url: string;
    title: string;
    source_type: string;
}

interface ResearchFindings {
    overall_sentiment: "positive" | "mixed" | "negative" | "unknown";
    rating: number | null;
    reviews_count: number | null;
    summary: string;
    what_they_do: string;
    sources: ResearchSource[];
    researched_at?: string;
}

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

// ─── Brave web search ──────────────────────────────────────────────────────

async function braveSearch(query: string, count = 10): Promise<BraveResult[]> {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return [];
    try {
        const url = `${BRAVE_WEB_URL}?q=${encodeURIComponent(query)}&count=${count}`;
        const res = await fetch(url, {
            headers: {
                "X-Subscription-Token": key,
                "Accept": "application/json",
            },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[research] brave ${res.status} ${res.statusText} for "${query}"`);
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
        console.warn(`[research] brave exception for "${query}":`, err instanceof Error ? err.message : err);
        return [];
    }
}

// ─── Source classification + ranking ────────────────────────────────────────

/** Classify a result URL into a coarse source_type and a relevance weight. */
function classifySource(url: string, companyWebsite?: string | null): { type: string; weight: number } {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return { type: "web", weight: 1 }; }

    const companyHost = (() => {
        if (!companyWebsite) return "";
        try {
            const h = companyWebsite.startsWith("http") ? companyWebsite : `https://${companyWebsite}`;
            return new URL(h).hostname.toLowerCase().replace(/^www\./, "");
        } catch { return ""; }
    })();

    if (companyHost && (host === companyHost || host.endsWith(`.${companyHost}`))) {
        return { type: "company_site", weight: 6 };
    }
    if (/(google\.com\/maps|g\.page|business\.google)/.test(url) || host === "google.com") return { type: "google_business", weight: 10 };
    if (host.includes("yelp.")) return { type: "yelp", weight: 9 };
    if (host.includes("bbb.org")) return { type: "bbb", weight: 9 };
    if (host.includes("clutch.co")) return { type: "clutch", weight: 8 };
    if (host.includes("trustpilot.")) return { type: "trustpilot", weight: 8 };
    if (host.includes("glassdoor.")) return { type: "glassdoor", weight: 5 };
    if (host.includes("indeed.")) return { type: "indeed", weight: 4 };
    if (host.includes("facebook.") || host.includes("linkedin.")) return { type: "social", weight: 4 };
    if (/news|nytimes|bizjournals|prnewswire|businesswire|forbes|reuters|apnews/.test(host)) return { type: "news", weight: 5 };
    return { type: "web", weight: 1 };
}

/** Merge + dedupe Brave results by URL, then rank by source weight. */
function rankResults(results: BraveResult[], companyWebsite?: string | null): Array<BraveResult & { source_type: string; weight: number }> {
    const seen = new Set<string>();
    const merged: Array<BraveResult & { source_type: string; weight: number }> = [];
    for (const r of results) {
        const key = r.url.split("#")[0];
        if (seen.has(key)) continue;
        seen.add(key);
        const { type, weight } = classifySource(r.url, companyWebsite);
        merged.push({ ...r, source_type: type, weight });
    }
    return merged.sort((a, b) => b.weight - a.weight);
}

// ─── OpenAI structured extraction ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a business-reputation research analyst. You read public web search results
(snippets) and crawled review/profile pages about a company, and produce a concise, factual review
summary used by a sales rep before an outreach call.

RULES
- Use ONLY facts supported by the supplied text. Never invent ratings, review counts, or claims.
- "overall_sentiment": one of "positive" | "mixed" | "negative" | "unknown". Use "unknown" when there
  is no usable signal about reputation.
- "rating": a 0-5 numeric star rating if one is clearly stated (e.g. "4.7 stars", "Rated 4.2/5").
  If a rating is on a different scale (e.g. /10), convert to a 0-5 scale. null if none found.
- "reviews_count": the integer number of reviews if stated (e.g. "based on 38 reviews"). null if none.
- "summary": 2-3 plain sentences on how the company is perceived (reputation, common praise/complaints,
  notable signals). If there is little reputation signal, say so honestly.
- "what_they_do": one sentence describing the company's actual business / services from the evidence.
- "sources": the source pages you drew from, each with its url, a short title, and a source_type
  (e.g. "google_business","yelp","bbb","clutch","company_site","news","web").

Write like a human analyst briefing a colleague — direct, specific, no marketing fluff.`;

function snippetFallbackSummary(companyName: string, ranked: Array<BraveResult & { source_type: string }>): ResearchFindings {
    const top = ranked.slice(0, 3);
    const joined = top.map((r) => r.snippet).filter(Boolean).join(" ").slice(0, 400);
    return {
        overall_sentiment: "unknown",
        rating: null,
        reviews_count: null,
        summary: joined
            ? `Search results for ${companyName}: ${joined}`
            : `No usable public reputation signal found for ${companyName}.`,
        what_they_do: "",
        sources: top.map((r) => ({ url: r.url, title: r.title, source_type: r.source_type })),
    };
}

async function extractFindings(
    companyName: string,
    state: string | null,
    ranked: Array<BraveResult & { source_type: string }>,
    crawled: Array<{ url: string; title: string; source_type: string; markdown: string }>,
): Promise<{ findings: ResearchFindings; errors: string[] }> {
    const errors: string[] = [];
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        errors.push("OPENAI_API_KEY not configured — snippet-only summary used");
        return { findings: snippetFallbackSummary(companyName, ranked), errors };
    }

    const client = new OpenAI({ apiKey: key });

    const searchBlock = ranked
        .slice(0, 10)
        .map((r, i) => `${i + 1}. [${r.source_type}] ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n");
    const crawledBlock = crawled
        .map((c) => `=== PAGE: ${c.title || c.url} [${c.source_type}] (${c.url}) ===\n${c.markdown.slice(0, 6000)}`)
        .join("\n\n");

    const userContent = [
        `COMPANY: ${companyName}${state ? ` (${state})` : ""}`,
        "",
        "WEB SEARCH RESULTS (titles + snippets):",
        searchBlock || "(none)",
        "",
        "CRAWLED PAGES (markdown, possibly truncated):",
        crawledBlock || "(none crawled)",
    ].join("\n");

    const schemaHint = `Return JSON with THIS EXACT shape (use null/[] for missing, never omit a key):
{
  "overall_sentiment": "positive" | "mixed" | "negative" | "unknown",
  "rating": 4.5,
  "reviews_count": 38,
  "summary": "2-3 sentences on reputation",
  "what_they_do": "one sentence on the business",
  "sources": [{"url":"https://...","title":"...","source_type":"google_business"}]
}`;

    try {
        const completion = await client.chat.completions.create({
            model: RESEARCH_MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "system", content: schemaHint },
                { role: "user", content: userContent },
            ],
        }, { timeout: 60_000 });

        const raw = completion.choices?.[0]?.message?.content || "{}";
        const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        let parsed: any = {};
        try { parsed = JSON.parse(cleaned); } catch {
            errors.push(`OpenAI returned unparseable JSON (${cleaned.length} chars)`);
            return { findings: snippetFallbackSummary(companyName, ranked), errors };
        }

        const sentiment = ["positive", "mixed", "negative", "unknown"].includes(parsed.overall_sentiment)
            ? parsed.overall_sentiment
            : "unknown";
        let rating: number | null = typeof parsed.rating === "number" ? parsed.rating : null;
        if (rating != null) {
            if (rating > 5 && rating <= 10) rating = Math.round((rating / 2) * 10) / 10; // /10 → /5
            if (rating < 0 || rating > 5) rating = null;
        }
        const reviewsCount: number | null =
            typeof parsed.reviews_count === "number" && parsed.reviews_count >= 0
                ? Math.round(parsed.reviews_count)
                : null;

        // Prefer model-attributed sources; fall back to the ranked list we fed it.
        const modelSources: ResearchSource[] = Array.isArray(parsed.sources)
            ? parsed.sources
                .map((s: any) => ({
                    url: String(s?.url || ""),
                    title: String(s?.title || ""),
                    source_type: String(s?.source_type || "web"),
                }))
                .filter((s: ResearchSource) => s.url)
            : [];
        const sources = modelSources.length
            ? modelSources
            : ranked.slice(0, 5).map((r) => ({ url: r.url, title: r.title, source_type: r.source_type }));

        const findings: ResearchFindings = {
            overall_sentiment: sentiment,
            rating,
            reviews_count: reviewsCount,
            summary: String(parsed.summary || "").trim() || snippetFallbackSummary(companyName, ranked).summary,
            what_they_do: String(parsed.what_they_do || "").trim(),
            sources,
        };
        return { findings, errors };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`OpenAI research extraction failed: ${msg}`);
        console.warn(`[research] OpenAI extraction failed for ${companyName}:`, msg);
        return { findings: snippetFallbackSummary(companyName, ranked), errors };
    }
}

// ─── Shared core (reused by /enrich so ONE action does everything) ───────────

export interface CompanyResearchResult {
    ok: boolean;
    rating: number | null;
    reviews_count: number | null;
    sentiment: ResearchFindings["overall_sentiment"];
    summary: string;
    sources: ResearchSource[];
    /** The full persisted blob (also written to contractors.research_findings). */
    findings: ResearchFindings;
    errors: string[];
}

/**
 * Run the public-reputation sweep for one company and persist it to the
 * contractors row (research_findings + researched_at, plus google_rating /
 * google_reviews_count when found). Resilient by design — Brave, crawl, and
 * OpenAI are each independently try/caught.
 *
 * Extracted from the route handler so the cockpit /enrich endpoint can run the
 * SAME research step inside its single "Research & fill gaps" action.
 */
export async function runCompanyResearch(args: {
    contractorId: string;
    companyName: string;
    state: string | null;
    website: string | null;
}): Promise<CompanyResearchResult> {
    const { contractorId, website } = args;
    const companyName = (args.companyName || "").trim();
    const state = (args.state || "").trim() || null;
    const errors: string[] = [];
    const sb = svc();

    const emptyFindings = (summary: string): ResearchFindings => ({
        overall_sentiment: "unknown",
        rating: null,
        reviews_count: null,
        summary,
        what_they_do: "",
        sources: [],
        researched_at: new Date().toISOString(),
    });

    if (!process.env.BRAVE_SEARCH_API_KEY) {
        const findings = emptyFindings(`Research skipped — BRAVE_SEARCH_API_KEY not configured.`);
        errors.push("BRAVE_SEARCH_API_KEY not set");
        return { ok: false, rating: null, reviews_count: null, sentiment: "unknown", summary: findings.summary, sources: [], findings, errors };
    }
    if (!companyName) {
        const findings = emptyFindings("Research skipped — contractor has no company_name.");
        errors.push("contractor has no company_name");
        return { ok: false, rating: null, reviews_count: null, sentiment: "unknown", summary: findings.summary, sources: [], findings, errors };
    }

    // 1) Brave web searches (reputation + general presence), in parallel.
    const reviewsQuery = `"${companyName}"${state ? ` ${state}` : ""} reviews`;
    const presenceQuery = `"${companyName}"${state ? ` ${state}` : ""}`;
    const [reviewHits, presenceHits] = await Promise.all([
        braveSearch(reviewsQuery, 10),
        braveSearch(presenceQuery, 10),
    ]);

    const ranked = rankResults([...reviewHits, ...presenceHits], website);
    if (ranked.length === 0) {
        errors.push("Brave returned no results for either query");
        const findings = emptyFindings(`No public web results found for ${companyName}${state ? ` (${state})` : ""}.`);
        try {
            await sb.from("contractors").update({ research_findings: findings, researched_at: findings.researched_at }).eq("id", contractorId);
        } catch (e: any) {
            errors.push(`persist failed: ${e?.message || e}`);
        }
        return { ok: true, rating: null, reviews_count: null, sentiment: "unknown", summary: findings.summary, sources: [], findings, errors };
    }

    // 2) Crawl the most relevant 2-3 result pages (best-effort).
    const toCrawl = ranked.slice(0, 3);
    const crawled: Array<{ url: string; title: string; source_type: string; markdown: string }> = [];
    const crawlResults = await Promise.all(
        toCrawl.map(async (r) => {
            try {
                const page = await scrapePage(r.url, { formats: ["markdown"], timeout: 25000 });
                if (page && page.markdown && page.markdown.length > 80) {
                    return { url: r.url, title: r.title, source_type: r.source_type, markdown: page.markdown };
                }
            } catch (e) {
                console.warn(`[research] crawl failed for ${r.url}:`, e instanceof Error ? e.message : e);
            }
            return null;
        }),
    );
    for (const c of crawlResults) if (c) crawled.push(c);

    // 3) OpenAI structured extraction.
    const { findings: extracted, errors: extractErrors } = await extractFindings(companyName, state, ranked, crawled);
    errors.push(...extractErrors);

    const findings: ResearchFindings = { ...extracted, researched_at: new Date().toISOString() };

    // 4) Persist. google_rating / google_reviews_count only when found.
    const update: Record<string, any> = {
        research_findings: findings,
        researched_at: findings.researched_at,
    };
    if (findings.rating != null) update.google_rating = findings.rating;
    if (findings.reviews_count != null) update.google_reviews_count = findings.reviews_count;

    try {
        const { error: upErr } = await sb.from("contractors").update(update).eq("id", contractorId);
        if (upErr) errors.push(`persist failed: ${upErr.message}`);
    } catch (e: any) {
        errors.push(`persist failed: ${e?.message || e}`);
    }

    return {
        ok: true,
        rating: findings.rating,
        reviews_count: findings.reviews_count,
        sentiment: findings.overall_sentiment,
        summary: findings.summary,
        sources: findings.sources,
        findings,
        errors,
    };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    if (!process.env.BRAVE_SEARCH_API_KEY) {
        return NextResponse.json({ ok: false, error: "BRAVE_SEARCH_API_KEY not set" }, { status: 200 });
    }

    let contractorId: string | undefined;
    try {
        const body = await req.json();
        contractorId = body?.contractor_id;
    } catch {
        return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    if (!contractorId) {
        return NextResponse.json({ ok: false, error: "contractor_id required" }, { status: 400 });
    }

    const sb = svc();

    // Load the contractor.
    const { data: contractor, error: loadErr } = await sb
        .from("contractors")
        .select("id, company_name, state, website")
        .eq("id", contractorId)
        .maybeSingle();
    if (loadErr) return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
    if (!contractor) return NextResponse.json({ ok: false, error: "contractor not found" }, { status: 404 });

    const companyName = (contractor.company_name || "").trim();
    if (!companyName) {
        return NextResponse.json({ ok: false, error: "contractor has no company_name" }, { status: 400 });
    }

    const res = await runCompanyResearch({
        contractorId,
        companyName,
        state: contractor.state || null,
        website: contractor.website || null,
    });

    return NextResponse.json({
        ok: res.ok,
        rating: res.rating,
        reviews_count: res.reviews_count,
        sentiment: res.sentiment,
        summary: res.summary,
        sources: res.sources,
        errors: res.errors.length ? res.errors : undefined,
    });
}
