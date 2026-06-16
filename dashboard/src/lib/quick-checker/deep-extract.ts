/**
 * Deep extraction — rewritten Quick Checker brain (Phase 2 overhaul).
 *
 * Replaces the original single-page Firecrawl + gpt-4o-mini one-shot with:
 *
 *   1. Multi-page crawl (homepage + scored deep-links + dedicated /contact,
 *      /about, /team, /services, /careers passes when discoverable).
 *   2. Footer-only secondary pass to catch legal name + HQ state that often
 *      hide in copyright lines.
 *   3. Single LLM call against the COMBINED markdown — Ollama first (free,
 *      self-hosted, qwen2.5:7b on Hostinger VPS), OpenAI fallback when the
 *      VPS is unreachable. The new schema demands strengths / weaknesses /
 *      pitch_angles / 3-5 nail-down keywords so the call-ready POV lands
 *      in HubSpot automatically.
 *
 * Why a separate module instead of editing extract.ts in place:
 *   - extract.ts is wired through the existing /api/analyze-company flow
 *     and other callers (/api/brand, /api/admin/enrich-profile). Swapping
 *     it directly risks breaking those.
 *   - The deep extractor is the new entry point for Quick Checker — old
 *     callers can migrate over once we've validated quality on real domains.
 *
 * Tuning notes:
 *   - Ollama qwen2.5:7b runs at ~50-80 tok/sec on the Hostinger box, so
 *     a 4000-token output settles in ~60s. We allow up to 90s before
 *     falling back. OpenAI gpt-4o-mini handles the same prompt in ~10s.
 *   - The combined-markdown cap is 35K chars (≈8K tokens at qwen's
 *     tokenizer). Beyond that we truncate per-page proportionally so the
 *     footer pass + first 3 service paragraphs always survive.
 */

import { z } from "zod";
import { callLLMJson } from "@/lib/llm/deepseek";
import { scrapePage, pickInterestingLinks, scrapePages, type FirecrawlPage } from "./firecrawl";
import { extractEmails, extractPhones } from "./contacts";
import { QuickCheckerExtraction } from "./schema";

// Budget retuned 2026-06-16. Ollama was dropped from the chain (Gemini is now
// primary, OpenAI fallback) so the old 6KB cap — tuned for a GPU-less VPS
// running qwen2.5:3b — was strangling extraction: with 6 pages it left only
// ~466 chars PER PAGE, which truncated the /about + /team content where the
// founding year and team size actually live. Gemini 2.5 Flash (≈1M ctx) and
// gpt-4o-mini (128k) handle far more, so we give each page real room.
//   - 30KB cap ≈ 8K input tokens → ~4.5KB per page across a 6-page crawl
//   - 2600 output tokens = full strategic schema with headroom
//   - 120s timeout = comfortable for Gemini/OpenAI (~6-15s typical)
const MAX_COMBINED_MD = 30_000;
const LLM_TIMEOUT_MS = 120_000;
const LLM_MAX_TOKENS = 2_600;

interface DeepExtractInput {
    website: string;
    companyName?: string;
    /** Override pages to crawl beyond auto-discovery (e.g. confirmed /contact). */
    extraPages?: string[];
    /** Hard cap on total pages — defaults to 6 for a balanced crawl. */
    maxPages?: number;
}

export interface DeepExtractResult {
    extraction: QuickCheckerExtraction;
    pages_scraped: string[];
    crawl_source: "firecrawl" | "fetch-fallback" | "mixed";
    llm_provider: "gemini" | "openai" | "deepseek" | "fallback";
    llm_model: string | null;
    duration_ms: number;
    errors: string[];
}

function normalizeUrl(raw: string): string {
    if (!raw) return "";
    const trimmed = raw.trim();
    if (!/^https?:\/\//i.test(trimmed)) return "https://" + trimmed.replace(/^\/+/, "");
    return trimmed.replace(/\/+$/, "");
}

/**
 * Heuristic: from the raw HTML, isolate the footer block (everything
 * after the last <footer ...> or below the visible "Copyright" line).
 * Pulls out the legal name + state hints buyers often miss.
 */
function extractFooter(html: string | undefined): string {
    if (!html) return "";
    // Prefer explicit <footer> ... </footer>
    const m = /<footer[^>]*>([\s\S]*?)<\/footer>/i.exec(html);
    if (m && m[1]) {
        return m[1]
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 3000);
    }
    // Fallback: text after the LAST "© / Copyright" line
    const stripped = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ");
    const idx = Math.max(stripped.toLowerCase().lastIndexOf("copyright"), stripped.lastIndexOf("©"));
    if (idx > -1) {
        return stripped.slice(idx, idx + 1500).replace(/\s+/g, " ").trim();
    }
    return "";
}

/**
 * Apply a length-budget across pages so big homepages don't squeeze out
 * the deep-link content. Each page gets a proportional share + the footer
 * is always preserved verbatim at the end.
 */
function combineMarkdown(pages: FirecrawlPage[], footer: string): string {
    if (pages.length === 0) return footer.slice(0, MAX_COMBINED_MD);
    const footerBudget = Math.min(footer.length, 2000);
    const remaining = Math.max(0, MAX_COMBINED_MD - footerBudget - 200 * pages.length);
    const perPage = Math.floor(remaining / pages.length);
    const chunks: string[] = [];
    for (const p of pages) {
        const slug = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
        chunks.push(`\n\n=== PAGE: ${slug} (${p.metadata.title || ""}) ===\n${p.markdown.slice(0, perPage)}`);
    }
    if (footer) chunks.push(`\n\n=== FOOTER (legal/legal-name/state hints) ===\n${footer.slice(0, footerBudget)}`);
    return chunks.join("");
}

// ── LLM prompt + parser ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a US federal-contracting research analyst. You read a company's public website
content and produce a STRATEGIC PROFILE used by a sales rep before a discovery call.

CORE RULES
- Only use facts SUPPORTED BY THE TEXT. Never invent.
- Distinguish what the COMPANY does from who they SERVE (a recruiting firm with logistics clients is in
  EXECUTIVE SEARCH, not logistics). The "services" field is what the company sells. "industries_served"
  is whose problems they solve.
- Certifications are real ONLY if the text says so word-for-word (e.g. "Veteran-Owned",
  "SDVOSB certified", "WOSB"). Put the exact quote in 'evidence'.
- "nail_down_keywords": 3-5 short phrases (STRICT: 2-4 WORDS EACH) that hyper-specifically describe
  what THIS company is best at. These drive federal-contract matching, so each phrase MUST be
  short enough to plausibly appear in a government solicitation title. Good: "fleet maintenance",
  "class-8 trucks", "obsolete electronics", "DOT inspections". Bad: "fleet maintenance for
  Class-8 trucks and trailers" (too long, won't match RFP titles). NEVER return empty unless
  the page has zero substantive content. NEVER include slashes — split into two entries.
- "capability_keywords": 8-15 SINGLE-WORD or 2-WORD phrases (STRICT max 2 words) that are likely
  to appear in federal opp titles for this company's domain. Good: "electronics", "wholesalers",
  "components", "schneider", "obsolete parts". Bad: "electronic component broker reseller"
  (too long, won't match). Tag the 3-5 most central as "primary", rest "secondary".
- "strengths": 3-5 short evidence-based phrases. Each must be a CREDIBLE federal-contracting
  asset (e.g. "Active SAM since 2019", "DoD past performance with NAVAIR", "WOSB-certified",
  "ISO 9001 quality system", "10+ years in business", "30+ engineers on staff"). Skip generic
  marketing puffery.
- "weaknesses": 3-5 short concrete gaps that will HURT federal pursuit, each paired with a
  remediation hint ("No SAM registration shown — must register before bidding", "Site lacks a
  past-performance section — add 3 case studies", "Single-state operations — limits geographic
  reach").
- "pitch_angles": 3-5 conversation openers the sales rep should lead with. These should be
  prospect-specific (NOT generic), reference something concrete from the site, and tie back
  to federal contracting. Example: "Your case study with TXDOT shows you know government
  procurement — we can amplify that into DOT federal contracts."
- "revenue_signal": one-line description of revenue size if hinted (e.g. "Forbes 5000",
  "$5M+ annual revenue claimed", "Bootstrapped startup"). null when no hint.
- "federal_agencies_served": list specific federal agencies the company has worked with by name
  (Navy, Army, DHS, NASA, etc.). Empty if none mentioned.
- Leadership: real people with real titles. Mark is_decision_maker for C-suite, Founder, Owner,
  President, Partner, Managing Director.
- "founded_year": the 4-digit year the company was founded. DERIVE it from any phrasing —
  "founded in 1998", "since 2005", "established 1990", "est. 1987", "serving X since 2010",
  "in business since 2003", "celebrating 20 years" (subtract from this year), or an anniversary
  badge. Do NOT use the website's copyright year (that's just the current year). Return the
  EARLIEST credible founding year. null only if no founding signal appears anywhere on the pages.
- "employee_count_estimate": an INTEGER estimate of team/headcount. DERIVE it from "team of 25",
  "30+ employees", "our 50 professionals", "a staff of 12", "100-person firm", or by COUNTING the
  distinct people shown on a team/leadership/about page. If only a range is hinted ("small team",
  "family-owned"), estimate conservatively (e.g. 5). null only if there is genuinely no signal.

RESPONSE FORMAT: Return ONLY a JSON object with the exact keys below. Use [] for empty arrays,
null where appropriate, never omit a key.`;

const SCHEMA_HINT = `{
  "company_name": "string",
  "dba_name": null,
  "tagline": "string or null",
  "short_description": "one sentence",
  "long_description": "2-4 sentences",
  "industries_served": ["healthcare","construction"],
  "services": [{"name":"...","description":"..."}],
  "products": ["..."],
  "differentiators": ["..."],
  "capability_keywords": [{"keyword":"managed data services","tier":"primary"}],
  "nail_down_keywords": ["fleet maintenance for Class-8 trucks","municipal road striping","DOT-compliant safety inspections"],
  "strengths": ["Active SAM registration since 2019","TXDOT past performance","WOSB-certified"],
  "weaknesses": ["No capability statement on site — needs one","Single-state operations","No CMMC certification noted — required for DoD prime work"],
  "pitch_angles": ["Lead with the TXDOT case study","Tie WOSB cert to upcoming HUBZone Sources Sought","Position the bonding capacity as a differentiator"],
  "revenue_signal": "Bootstrapped, est. $2-5M annual revenue from team size",
  "federal_agencies_served": ["DoT","TXDOT"],
  "leadership": [{"name":"...","title":"...","email":null,"phone":null,"linkedin_url":null,"is_decision_maker":true}],
  "contacts": [{"email":"info@...","phone":null,"phone_type":"main"}],
  "headquarters_city": null,
  "headquarters_state": null,
  "service_areas": [],
  "founded_year": 2017,
  "employee_count_estimate": null,
  "certifications": [{"type":"WOSB","evidence":"exact quote from site","confidence":0.9}],
  "partnerships": [{"partner":"AWS","kind":"technology_partner"}],
  "past_customers": ["..."],
  "awards": ["..."],
  "has_gov_experience": true,
  "gov_experience_evidence": ["exact quote"],
  "social_links": {"linkedin":null,"facebook":null,"twitter":null,"youtube":null}
}`;

// Deterministic founding-year scrape. Patterns like "founded in 1998", "since
// 2005", "established 1990", "est. 1987", "serving … since 2010". Returns the
// EARLIEST plausible year (founding, not a later milestone). Copyright lines
// (e.g. "© 2026") are deliberately NOT matched — they're the current year.
function deriveFoundedYear(text: string): number | null {
    if (!text) return null;
    const CUR = new Date().getUTCFullYear();
    const re = /\b(?:founded(?:\s+in)?|since|established|est\.?|in\s+business\s+since|serving\b[^.]{0,40}?\bsince)\b[^0-9]{0,12}((?:18|19|20)\d{2})\b/gi;
    const years: number[] = [];
    for (const m of text.matchAll(re)) {
        const y = parseInt(m[1], 10);
        if (y >= 1850 && y <= CUR) years.push(y);
    }
    // "celebrating 20 years" / "20 years in business" → CUR - N
    const anniv = /\b(\d{1,3})\s*(?:\+)?\s*years?\s+(?:in\s+business|of\s+(?:service|experience|excellence)|strong)\b/gi;
    for (const m of text.matchAll(anniv)) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 175) years.push(CUR - n);
    }
    return years.length ? Math.min(...years) : null;
}

// Deterministic team-size scrape. "team of 25", "30+ employees", "staff of 12",
// "50 professionals/engineers/people". Returns the largest plausible figure.
function deriveTeamSize(text: string): number | null {
    if (!text) return null;
    const sizes: number[] = [];
    const re1 = /\b(?:team|staff|crew|workforce)\s+of\s+(\d{1,5})\b/gi;
    const re2 = /\b(\d{1,5})\s*\+?\s*(?:employees|professionals|engineers|team\s*members|staff\s*members|people\s+on\s+staff|person\s+(?:team|firm|company))\b/gi;
    for (const m of text.matchAll(re1)) sizes.push(parseInt(m[1], 10));
    for (const m of text.matchAll(re2)) sizes.push(parseInt(m[1], 10));
    const plausible = sizes.filter(n => n >= 1 && n <= 500_000);
    return plausible.length ? Math.max(...plausible) : null;
}

/** Heuristic fallback used when LLM fails entirely. */
function heuristicExtraction(input: DeepExtractInput, md: string, meta: FirecrawlPage["metadata"]): QuickCheckerExtraction {
    const phones = extractPhones(md);
    const emails = extractEmails(md);
    const title = (meta.ogSiteName || meta.title || "").split("|")[0].trim();
    return QuickCheckerExtraction.parse({
        company_name: input.companyName || title || "",
        short_description: meta.description || md.slice(0, 200).replace(/\s+/g, " ").trim(),
        long_description: md.slice(0, 800).replace(/\s+/g, " ").trim(),
        contacts: [
            ...phones.slice(0, 2).map(p => ({ email: null as string | null, phone: p.national, phone_type: p.type === "mobile" ? "mobile" : "main" })),
            ...emails.slice(0, 2).map(e => ({ email: e.normalized, phone: null, phone_type: null })),
        ],
        certifications: /veteran[\s-]owned/i.test(md)
            ? [{ type: "veteran_owned", evidence: "veteran-owned mention", confidence: 0.6 }]
            : [],
        has_gov_experience: /federal|department of defense|u\.s\.\s*(army|navy|air\s*force)|gsa schedule/i.test(md),
        weaknesses: ["Unable to deep-extract — LLM unavailable; review the site manually before pitching."],
    });
}

const LLMResponseSchema = z.record(z.string(), z.unknown());

async function callDeepExtractLLM(
    combined: string,
    input: DeepExtractInput,
): Promise<{ extraction: Record<string, unknown>; provider: "gemini" | "openai" | "deepseek"; model: string } | null> {
    const userContent = [
        `WEBSITE: ${input.website}`,
        input.companyName ? `KNOWN COMPANY NAME: ${input.companyName}` : "",
        "",
        "AGGREGATED PAGE CONTENT (multiple pages, footer at end):",
        combined,
    ].filter(Boolean).join("\n");

    // Provider cascade — first available wins. Ordered by reliability +
    // cost-effectiveness, NOT raw cost. Real-world reasons:
    //   - DeepSeek: $0.14/M in · $0.28/M out, ~10s response, paid + always-on.
    //     The most reliable cheap option.
    //   - OpenAI: $0.15/M in · $0.60/M out, ~6-10s response. Solid backstop,
    //     but burns quota when DeepSeek is healthy.
    //   - Ollama: free (self-hosted), but qwen2.5:7b on a single Hostinger
    //     VPS OOMs on 15KB+ prompts. Kept as the LAST resort for cheapest
    //     bulk reruns / offline development.
    // ENV switches: LLM_PROVIDER=ollama|deepseek|openai forces a specific
    // provider; otherwise we just walk this list and use the first one with
    // credentials set.
    const order: Array<"gemini" | "deepseek" | "openai"> = [];
    if (process.env.GEMINI_API_KEY)   order.push("gemini");
    if (process.env.DEEPSEEK_API_KEY) order.push("deepseek");
    if (process.env.OPENAI_API_KEY)   order.push("openai");
    if (order.length === 0) {
        console.warn("[deep-extract] no LLM providers configured (need GEMINI_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY)");
        return null;
    }

    for (const provider of order) {
        try {
            const raw = await Promise.race([
                callLLMJson<Record<string, unknown>>([
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "system", content: `JSON SCHEMA (exact keys required, use defaults on uncertainty):\n${SCHEMA_HINT}` },
                    { role: "user", content: userContent },
                ], {
                    provider,
                    temperature: 0.2,
                    max_tokens: LLM_MAX_TOKENS,
                }),
                new Promise<Record<string, unknown>>((_, reject) =>
                    setTimeout(() => reject(new Error(`${provider} timeout after ${LLM_TIMEOUT_MS}ms`)), LLM_TIMEOUT_MS),
                ),
            ]);
            const parsed = LLMResponseSchema.safeParse(raw);
            if (!parsed.success) continue;
            return {
                extraction: parsed.data,
                provider,
                model: provider === "gemini"
                    ? (process.env.GEMINI_MODEL || "gemini-2.5-flash")
                    : provider === "deepseek"
                        ? "deepseek-chat"
                        : (process.env.QUICK_CHECKER_MODEL || "gpt-4o-mini"),
            };
        } catch (err) {
            console.warn(`[deep-extract] ${provider} failed:`, err instanceof Error ? err.message : err);
            continue;
        }
    }
    return null;
}

// ── Main entry ──────────────────────────────────────────────────────────

export async function runDeepExtract(input: DeepExtractInput): Promise<DeepExtractResult> {
    const started = Date.now();
    const errors: string[] = [];
    const url = normalizeUrl(input.website);

    if (!url || !/^https?:\/\//.test(url)) {
        errors.push("Invalid URL");
        return {
            extraction: QuickCheckerExtraction.parse({}),
            pages_scraped: [],
            crawl_source: "fetch-fallback",
            llm_provider: "fallback",
            llm_model: null,
            duration_ms: Date.now() - started,
            errors,
        };
    }

    // 1) Homepage + links
    const home = await scrapePage(url, { formats: ["markdown", "links", "html"] });
    if (!home) {
        errors.push("Homepage scrape returned nothing");
        return {
            extraction: QuickCheckerExtraction.parse({ company_name: input.companyName || "" }),
            pages_scraped: [],
            crawl_source: "fetch-fallback",
            llm_provider: "fallback",
            llm_model: null,
            duration_ms: Date.now() - started,
            errors,
        };
    }

    // 2) Deep-link discovery. Always try these canonical paths explicitly
    //    even if they aren't in the homepage links — many sites bury the
    //    /about page two clicks deep but still ship it at the expected URL.
    const maxPages = Math.max(1, Math.min(8, input.maxPages ?? 6));
    const seedExtra = (input.extraPages || []).map(normalizeUrl);
    const canonical = ["/about", "/about-us", "/contact", "/contact-us", "/team", "/services", "/capabilities", "/who-we-are"]
        .map(p => {
            try { return new URL(p, url).href; } catch { return null; }
        })
        .filter((v): v is string => !!v);
    const autoPicked = pickInterestingLinks(home.links, url, maxPages - 1);
    const candidates = Array.from(new Set([...seedExtra, ...autoPicked, ...canonical])).slice(0, maxPages - 1);
    const extraPages = candidates.length > 0
        ? await scrapePages(candidates, { formats: ["markdown"] })
        : [];

    const allPages: FirecrawlPage[] = [home, ...extraPages];
    const footer = extractFooter(home.html);
    const combined = combineMarkdown(allPages, footer);

    // 3) LLM extraction (Ollama → OpenAI cascade)
    const llmOut = await callDeepExtractLLM(combined, { ...input, website: url });

    let extraction: QuickCheckerExtraction;
    let provider: DeepExtractResult["llm_provider"] = "fallback";
    let model: string | null = null;

    if (llmOut) {
        // Merge into the schema defaults so missing keys don't throw.
        const safe = QuickCheckerExtraction.safeParse(llmOut.extraction);
        if (safe.success) {
            extraction = safe.data;
        } else {
            errors.push(`Zod rejected LLM output: ${safe.error.issues.slice(0, 3).map(i => i.path.join(".") + ":" + i.message).join("; ")}`);
            extraction = QuickCheckerExtraction.parse(llmOut.extraction);
        }
        provider = llmOut.provider;
        model = llmOut.model;
    } else {
        errors.push("All LLM providers failed — using heuristic fallback");
        extraction = heuristicExtraction(input, combined, home.metadata);
    }

    // 4) Always overlay validated phones/emails — LLMs miss footer numbers.
    const validPhones = extractPhones(combined);
    const validEmails = extractEmails(combined);
    if (validPhones.length > 0 || validEmails.length > 0) {
        const seenPhones = new Set(extraction.contacts.map(c => (c.phone || "").replace(/\D/g, "")).filter(Boolean));
        const seenEmails = new Set(extraction.contacts.map(c => (c.email || "").toLowerCase()).filter(Boolean));
        for (const p of validPhones) {
            const norm = p.e164.replace(/\D/g, "");
            if (seenPhones.has(norm)) continue;
            extraction.contacts.push({ email: null, phone: p.national, phone_type: p.type === "mobile" ? "mobile" : "main" });
            seenPhones.add(norm);
        }
        for (const e of validEmails) {
            if (seenEmails.has(e.normalized)) continue;
            extraction.contacts.push({ email: e.normalized, phone: null, phone_type: null });
            seenEmails.add(e.normalized);
        }
    }

    // 4b) Overlay deterministic founding-year / team-size when the LLM missed
    //     them — these live verbatim in "since 2005" / "team of 25" text, so a
    //     regex is more reliable than the model and never invents a number.
    if (extraction.founded_year == null) {
        const fy = deriveFoundedYear(combined);
        if (fy) extraction.founded_year = fy;
    }
    if (extraction.employee_count_estimate == null) {
        const ts = deriveTeamSize(combined);
        if (ts) extraction.employee_count_estimate = ts;
    }

    // 5) Apply company-name override if caller knew it
    if (input.companyName && input.companyName.trim().length > 1) {
        extraction.company_name = input.companyName.trim();
    }

    // 6) Defensive: if LLM gave 0 keywords but we have services, derive a few
    //    so downstream match-scoring has SOMETHING to keyword-match on.
    if (extraction.nail_down_keywords.length === 0 && extraction.services.length > 0) {
        extraction.nail_down_keywords = extraction.services
            .slice(0, 5)
            .map(s => s.name)
            .filter(s => s && s.length > 3);
    }
    if (extraction.capability_keywords.length === 0 && extraction.nail_down_keywords.length > 0) {
        extraction.capability_keywords = extraction.nail_down_keywords.map(k => ({ keyword: k, tier: "primary" }));
    }

    return {
        extraction,
        pages_scraped: allPages.map(p => p.url),
        crawl_source: allPages.every(p => p.source === "firecrawl")
            ? "firecrawl"
            : allPages.every(p => p.source === "fetch-fallback")
                ? "fetch-fallback"
                : "mixed",
        llm_provider: provider,
        llm_model: model,
        duration_ms: Date.now() - started,
        errors,
    };
}
