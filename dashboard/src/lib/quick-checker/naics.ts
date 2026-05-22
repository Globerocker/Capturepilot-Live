/**
 * NAICS inference against a whitelist (either the DB naics_codes table or
 * the static NAICS_CODES module). The model is constrained to pick from
 * the provided candidates only — it cannot hallucinate codes.
 */

import OpenAI from "openai";
import { NAICS_CODES, type NaicsCode } from "@/lib/naics-codes";
import { classifyNaics } from "@/lib/naics-classifier";
import type { QuickCheckerExtraction, NaicsGuess } from "./schema";

const MODEL = process.env.QUICK_CHECKER_MODEL || "gpt-4o-mini";

interface InferInput {
    companyName: string;
    extraction: QuickCheckerExtraction;
    pageContent: string;
    samNaics?: string[];
    usaSpendingNaics?: string[];
    allowlist?: NaicsCode[];
}

export interface InferredNaics {
    code: string;
    label: string;
    confidence: number;
    matched_keywords: string[];
    source: "sam" | "usaspending" | "ai" | "keyword_fallback";
}

const SYSTEM_PROMPT = `You are a NAICS classification expert for U.S. federal contracting.
Given a company's website content and a WHITELIST of candidate codes, pick the best 1–3 codes
that describe what the company actually does. You MUST only return codes that appear in the
whitelist — never invent a code.

## How to decide the PRIMARY code

The primary NAICS describes the company's CORE INDUSTRY (what they sell, who their customers
are), NOT individual technical activities that happen to use shared vocabulary.

1. INDUSTRIES SERVED + CAPABILITY KEYWORDS are the strongest signal. If the company says it
   serves "agriculture" / "construction" / "healthcare" / "defense" / etc., the primary code
   must reflect that industry. Pick an 11xxxx code for agriculture, 23xxxx for construction,
   62xxxx for healthcare delivery, etc.

2. Use SERVICES + DESCRIPTION to refine WHICH code within that industry.

3. Use PAGE CONTENT (raw text) only as a fact-check — never let a single keyword match
   in the raw text override an industry signal that's clear in INDUSTRIES SERVED.

## Anti-hallucination guardrails — common mistakes to AVOID

- Word "custom"/"customizing" → 541511 Custom Computer Programming. WRONG when the company
  isn't a software firm. "Customizing spray equipment" for a farm is 333111 (Farm Machinery)
  or 115xxx (Ag Services), NOT 541511. "Custom" in English means "tailored," not "computer".
- Word "intelligent"/"AI"/"data" → 541512 / 541511. WRONG when the company applies AI as a
  TOOL inside another industry. An agtech company using AI for crop optimization is still
  Agriculture (11xxxx). Pick 541511/541512 only when the company SELLS software/AI services
  to other businesses.
- Word "consulting"/"services" → 541xxx Professional Services. WRONG when it's a domain
  consulting (farm consulting → 115116 Farm Management Services, NOT 541611 Management
  Consulting).
- Industry-focused company that "leverages technology" is STILL in its industry. A precision-
  agriculture firm is Agriculture even if their website talks about AI, data analytics, and
  software platforms.

## Confidence rules

- 0.9+ means the website explicitly and repeatedly describes this work, AND it aligns with
  INDUSTRIES SERVED. Avoid 0.9+ when only the raw page content supports it.
- 0.6–0.8 means this is a plausible secondary line of business.
- Below 0.5 = don't include it.
- The 'reason' field must quote specific text from the page AND show how it ties to
  INDUSTRIES SERVED (e.g. "industries_served includes 'agriculture' and the page says
  'precision agriculture for growers' — direct agriculture-services match").

Return STRICT JSON only:
{"codes":[{"code":"115116","confidence":0.92,"reason":"industries_served = 'agriculture'; page says 'precision agriculture for growers' — Farm Management Services is the direct sectoral fit"}]}`;

export async function inferNaics(input: InferInput): Promise<InferredNaics[]> {
    const allow = input.allowlist && input.allowlist.length > 0 ? input.allowlist : NAICS_CODES;
    const allowSet = new Set(allow.map(c => c.code));
    const labelFor = (code: string) => allow.find(c => c.code === code)?.label || code;

    const out: InferredNaics[] = [];

    // 1) SAM-registered NAICS — authoritative, confidence 1.0
    for (const code of input.samNaics || []) {
        if (!allowSet.has(code)) continue;
        if (out.some(o => o.code === code)) continue;
        out.push({
            code,
            label: labelFor(code),
            confidence: 1.0,
            matched_keywords: ["SAM.gov registration"],
            source: "sam",
        });
    }

    // 2) Past federal awards (USASpending) — high confidence
    for (const code of input.usaSpendingNaics || []) {
        if (!allowSet.has(code)) continue;
        if (out.some(o => o.code === code)) continue;
        out.push({
            code,
            label: labelFor(code),
            confidence: 0.95,
            matched_keywords: ["Past federal award history"],
            source: "usaspending",
        });
    }

    // 3) Primary: OpenAI against a whitelist constructed from the company's capability keywords.
    //    We send the most plausible ~80 candidates to keep the prompt tight.
    const key = process.env.OPENAI_API_KEY;
    if (key) {
        const shortlist = shortlistCandidates(input.extraction, allow).slice(0, 80);
        if (shortlist.length > 0) {
            try {
                const client = new OpenAI({ apiKey: key });
                const userContent = buildUserPrompt(input, shortlist);
                const resp = await client.chat.completions.create({
                    model: MODEL,
                    temperature: 0,
                    response_format: { type: "json_object" },
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userContent },
                    ],
                }, { timeout: 30_000 });
                const raw = resp.choices?.[0]?.message?.content || "{}";
                const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
                const codes = Array.isArray(parsed.codes) ? parsed.codes : [];
                for (const c of codes) {
                    const code = String(c?.code || "");
                    if (!/^\d{6}$/.test(code)) continue;
                    if (!allowSet.has(code)) continue;
                    if (out.some(o => o.code === code)) continue;
                    out.push({
                        code,
                        label: labelFor(code),
                        confidence: Math.min(0.95, Math.max(0, Number(c?.confidence) || 0.7)),
                        matched_keywords: [String(c?.reason || "AI classification")],
                        source: "ai",
                    });
                    if (out.length >= 5) break;
                }
            } catch (err) {
                console.warn("[quick-checker/naics] OpenAI inference failed:", err instanceof Error ? err.message : err);
            }
        }
    }

    // 4) Fallback: keyword classifier if we still have nothing
    if (out.length === 0) {
        const desc = input.extraction.short_description || input.extraction.long_description;
        const services = input.extraction.services.map(s => s.name);
        const keywordResults = classifyNaics(desc, services, input.pageContent);
        for (const k of keywordResults) {
            if (!allowSet.has(k.code)) continue;
            out.push({
                code: k.code,
                label: k.label,
                confidence: k.confidence,
                matched_keywords: k.matched_keywords || [],
                source: "keyword_fallback",
            });
        }
    }

    out.sort((a, b) => b.confidence - a.confidence);
    return out.slice(0, 5);
}

// Map well-known industry phrases → NAICS 2-digit sector prefixes. When a
// company explicitly serves one of these industries we boost matching codes
// in the shortlist so the LLM gets the right candidates near the top.
// Sector codes ref: census.gov/naics — 11 Ag, 21 Mining, 22 Utilities,
// 23 Construction, 31-33 Manufacturing, 42 Wholesale, 44-45 Retail, 48-49
// Transport, 51 Information, 52 Finance, 53 Real Estate, 54 Professional,
// 55 Mgmt, 56 Admin/Waste, 61 Education, 62 Healthcare, 71 Arts, 72 Food,
// 81 Other Services.
const INDUSTRY_PREFIX_HINTS: Array<{ match: RegExp; prefixes: string[] }> = [
    { match: /\b(agricult|farming|farm|crop|livestock|agronom|agtech|agri[-\s]?tech|growers?|orchards?)\b/i, prefixes: ["11", "333111", "424910"] },
    { match: /\b(constructi|contractor|civil engineer|general contractor|excavat|roofing|hvac|electrical)\b/i, prefixes: ["23"] },
    { match: /\b(manufactur|machining|fabricat|production line|industrial product)\b/i, prefixes: ["31", "32", "33"] },
    { match: /\b(healthcare|hospital|clinic|nursing|medical practice|dental)\b/i, prefixes: ["62"] },
    { match: /\b(transport|logistics|trucking|freight|shipping|warehouse|warehousing)\b/i, prefixes: ["48", "49", "493"] },
    { match: /\b(retail|wholesal|distribut|e-?commerce)\b/i, prefixes: ["42", "44", "45"] },
    { match: /\b(education|school|university|training|edtech)\b/i, prefixes: ["61"] },
    { match: /\b(restaurant|food service|catering|hospitality|hotel)\b/i, prefixes: ["72"] },
    { match: /\b(janitor|cleaning|landscap|facility maintenance|facilities)\b/i, prefixes: ["56"] },
    { match: /\b(defense|aerospace|missile|weapons?|munition)\b/i, prefixes: ["3364", "3328", "3329", "541330", "541715"] },
    { match: /\b(software|saas|cloud platform|web app|mobile app|ide|api gateway)\b/i, prefixes: ["5415", "5112"] },
];

function detectIndustryPrefixes(ex: QuickCheckerExtraction): string[] {
    const hay = [
        ...ex.industries_served,
        ...ex.capability_keywords.map(k => k.keyword),
        ...ex.services.map(s => `${s.name} ${s.description || ""}`),
        ex.short_description || "",
        ex.long_description || "",
    ].join(" ").toLowerCase();
    const prefixes = new Set<string>();
    for (const hint of INDUSTRY_PREFIX_HINTS) {
        if (hint.match.test(hay)) {
            for (const p of hint.prefixes) prefixes.add(p);
        }
    }
    return Array.from(prefixes);
}

function shortlistCandidates(ex: QuickCheckerExtraction, all: NaicsCode[]): NaicsCode[] {
    const keywords = [
        ...ex.capability_keywords.map(k => k.keyword.toLowerCase()),
        ...ex.industries_served.map(s => s.toLowerCase()),
        ...ex.services.map(s => s.name.toLowerCase()),
    ];
    const popular = all.filter(c => c.popular);
    const industryPrefixes = detectIndustryPrefixes(ex);
    const scored: Array<{ c: NaicsCode; score: number }> = [];
    for (const c of all) {
        const label = c.label.toLowerCase();
        let s = 0;
        for (const k of keywords) {
            if (!k) continue;
            if (label.includes(k)) s += 3;
            else {
                for (const tok of k.split(/\s+/)) {
                    if (tok.length > 3 && label.includes(tok)) s += 1;
                }
            }
        }
        // Industry-prefix boost — heavy weight so sector-aligned codes
        // out-rank stray label-token matches like "custom" → 541511.
        if (industryPrefixes.length > 0) {
            for (const prefix of industryPrefixes) {
                if (c.code.startsWith(prefix)) {
                    s += 6;
                    break;
                }
            }
        }
        if (s > 0) scored.push({ c, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, 60).map(s => s.c);
    // Always include the popular ones so the model always has a sane default set
    const seen = new Set(picked.map(p => p.code));
    for (const p of popular) {
        if (!seen.has(p.code)) {
            picked.push(p);
            seen.add(p.code);
        }
        if (picked.length >= 100) break;
    }
    return picked;
}

function buildUserPrompt(input: InferInput, shortlist: NaicsCode[]): string {
    // Structured industry signals come FIRST — the model attends most to
    // early content. INDUSTRIES SERVED is the canonical "what sector is this
    // company in?" answer and should anchor the classification.
    return [
        `COMPANY: ${input.companyName}`,
        `INDUSTRIES SERVED (primary anchor for the NAICS sector): ${input.extraction.industries_served.join(", ") || "(unclear — fall back to capability keywords + description)"}`,
        `CAPABILITY KEYWORDS: ${input.extraction.capability_keywords.map(k => k.keyword).join(", ") || "(none)"}`,
        `SERVICES: ${input.extraction.services.map(s => `${s.name}: ${s.description}`).slice(0, 12).join(" | ") || "(none extracted)"}`,
        `DESCRIPTION: ${input.extraction.short_description || input.extraction.long_description.slice(0, 500)}`,
        ``,
        `WHITELIST (code → label) — you MUST pick from this list. Codes have been ordered so likely matches appear near the top:`,
        shortlist.map(c => `${c.code} → ${c.label}`).join("\n"),
        ``,
        `PAGE CONTENT (raw text — use ONLY as a fact-check; do not let isolated word matches like 'custom' override the INDUSTRIES SERVED signal):`,
        input.pageContent.slice(0, 4000),
    ].join("\n");
}
