/**
 * Structured-output extraction via OpenAI.
 *
 * Takes cleaned markdown (Firecrawl) and produces a validated
 * QuickCheckerExtraction — a single structured payload describing the
 * company, its leadership, contacts, industries, services, certs and
 * gov-contracting signals. We use the Responses-style JSON mode with a
 * strict system prompt so the model can't invent fields.
 *
 * If OpenAI is unavailable (no key, rate-limit, timeout) we still
 * return a minimally-populated object derived from metadata + simple
 * heuristics so downstream code never crashes.
 */

import OpenAI from "openai";
import { QuickCheckerExtraction } from "./schema";
import { extractEmails, extractPhones } from "./contacts";

const MODEL = process.env.QUICK_CHECKER_MODEL || "gpt-4o-mini";
const MAX_MARKDOWN = 20_000;

const SYSTEM_PROMPT = `You are a U.S. federal-contracting research analyst. You read a company's public
website content and extract structured facts about the business. You ONLY use facts that appear in the
supplied text — you never invent names, phone numbers, certifications, or past customers.

THE #1 MISTAKE TO AVOID — distinguish "what the COMPANY does" from "who the company SERVES".
A recruiting firm with logistics clients is in EXECUTIVE SEARCH, not logistics. A law firm
representing hospitals is in LEGAL SERVICES, not healthcare. An IT consultancy serving banks
is in IT CONSULTING, not finance. The "services" field describes the company's OWN offering.
The "industries_served" field is where you put the customer's industry — keep them separate.

RULES
- If a field is not clearly supported by the text, return an empty string, null, or empty array.
- Never guess certifications. Return a certification only when the text explicitly mentions it
  (e.g. "Veteran-Owned" → veteran_owned; "SDVOSB certified" → SDVOSB). Put the exact supporting
  quote in 'evidence'.
- Leadership: only real people named on the site with a real title. Mark is_decision_maker=true
  for C-suite, Founder, Owner, President, Partner, Managing Director; false otherwise.
- Services: the company's OWN offering (what they sell). Use action nouns ("executive search",
  "managed IT services", "fleet maintenance"). Do NOT put customer industries here.
- Capability keywords: extract 8–20 concise phrases buyers would search for to find THIS
  company (e.g. "executive search", "supply chain recruiting", "managed data services",
  "contract automation"). Tag the 3–5 most central ones as "primary", the rest as
  "secondary". These drive match scoring — be specific, avoid filler like "solutions" or
  "services" alone. ALWAYS return at least 5 keywords if the page has any substantive
  description of what the company does — an empty list is almost always wrong.
- Industries served: customer industries — normalize to noun phrases ("healthcare", "higher
  education", "construction", "oil & gas"). Don't invent industries not mentioned. This is
  SEPARATE from the company's own service offering — see the "#1 mistake" rule above.
- has_gov_experience=true only when federal/DoD/military/agency work is mentioned explicitly. Put
  the exact supporting quote in gov_experience_evidence.
- Contacts are for the COMPANY (main line, info@). Personal lines belong on the Person.
- Founded year must be a 4-digit year between 1800 and the current year if present in the text.`;

interface ExtractInput {
    website: string;
    metaTitle?: string;
    metaDescription?: string;
    siteName?: string;
    markdown: string;
}

function cleanMarkdown(md: string, max = 1200): string {
    return md
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "")            // strip image markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")         // flatten links
        .replace(/[#*_`>]/g, "")                          // drop markdown glyphs
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function heuristicFallback(input: ExtractInput): QuickCheckerExtraction {
    const phones = extractPhones(input.markdown);
    const emails = extractEmails(input.markdown);
    const title = (input.siteName || input.metaTitle || "").split("|")[0].trim();
    return {
        company_name: title,
        dba_name: null,
        tagline: input.metaTitle || null,
        short_description: input.metaDescription || cleanMarkdown(input.markdown, 200),
        long_description: cleanMarkdown(input.markdown, 1200),
        industries_served: [],
        services: [],
        products: [],
        differentiators: [],
        capability_keywords: [],
        leadership: [],
        contacts: [
            ...phones.slice(0, 2).map(p => ({ email: null, phone: p.national, phone_type: (p.type === "mobile" ? "mobile" : "main") as "main" | "mobile" })),
            ...emails.slice(0, 2).map(e => ({ email: e.normalized, phone: null, phone_type: null })),
        ],
        headquarters_city: null,
        headquarters_state: null,
        service_areas: [],
        founded_year: null,
        employee_count_estimate: null,
        certifications: /veteran[\s-]owned/i.test(input.markdown) ? [{ type: "veteran_owned", evidence: "veteran-owned", confidence: 0.7 }] : [],
        partnerships: [],
        past_customers: [],
        awards: [],
        has_gov_experience: /federal|department of defense|u\.s\.\s*air\s*force|u\.s\.\s*army|u\.s\.\s*navy|department of veterans|gsa schedule/i.test(input.markdown),
        gov_experience_evidence: [],
        social_links: { linkedin: null, facebook: null, twitter: null, youtube: null },
        // Phase 2 strategic fields — heuristic path can't infer these, so
        // ship empty defaults. The deep-extract path always populates them.
        nail_down_keywords: [],
        strengths: [],
        weaknesses: [],
        pitch_angles: [],
        revenue_signal: null,
        federal_agencies_served: [],
    };
}

export async function extractStructured(input: ExtractInput): Promise<{
    extraction: QuickCheckerExtraction;
    model_used: string | null;
    errors: string[];
}> {
    const errors: string[] = [];
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        errors.push("OPENAI_API_KEY not configured — heuristic fallback used");
        return { extraction: heuristicFallback(input), model_used: null, errors };
    }

    const client = new OpenAI({ apiKey: key });
    const userContent = [
        `WEBSITE: ${input.website}`,
        input.siteName ? `SITE NAME: ${input.siteName}` : "",
        input.metaTitle ? `META TITLE: ${input.metaTitle}` : "",
        input.metaDescription ? `META DESCRIPTION: ${input.metaDescription}` : "",
        "",
        "PAGE CONTENT (markdown, possibly truncated):",
        input.markdown.slice(0, MAX_MARKDOWN),
    ].filter(Boolean).join("\n");

    try {
        const schemaHint = `Return JSON with THIS EXACT shape (use null/[] for missing fields, never omit a key):
{
  "company_name": "string",
  "dba_name": null,
  "tagline": "string or null",
  "short_description": "one sentence",
  "long_description": "2-4 sentences",
  "industries_served": ["healthcare","construction", ...],
  "services": [{"name":"...","description":"..."}],
  "products": ["product name"],
  "differentiators": ["..."],
  "capability_keywords": [{"keyword":"managed data services","tier":"primary"}, ...],
  "leadership": [{"name":"...","title":"...","email":null,"phone":null,"linkedin_url":null,"is_decision_maker":true}],
  "contacts": [{"email":"info@...","phone":null,"phone_type":"main"}],
  "headquarters_city": null,
  "headquarters_state": null,
  "service_areas": [],
  "founded_year": 2017,
  "employee_count_estimate": null,
  "certifications": [{"type":"VOSB","evidence":"...","confidence":0.9}],
  "partnerships": [{"partner":"AWS","kind":"technology_partner"}],
  "past_customers": ["..."],
  "awards": ["..."],
  "has_gov_experience": true,
  "gov_experience_evidence": ["exact quote"],
  "social_links": {"linkedin":null,"facebook":null,"twitter":null,"youtube":null}
}`;

        const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "system", content: schemaHint },
                { role: "user", content: userContent },
            ],
        }, { timeout: 45_000 });

        const raw = completion.choices?.[0]?.message?.content || "{}";
        const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(cleaned); } catch {
            errors.push(`LLM returned unparseable JSON (${cleaned.length} chars)`);
            return { extraction: heuristicFallback(input), model_used: MODEL, errors };
        }

        // Deep-merge the LLM output into the heuristic fallback so we never return empty
        // fields if the model DID supply them.
        const fallback = heuristicFallback(input);
        const merged: Record<string, unknown> = { ...fallback };
        for (const [k, v] of Object.entries(parsed)) {
            if (v === null || v === undefined) continue;
            if (Array.isArray(v) && v.length === 0) continue;
            if (typeof v === "string" && v.trim() === "") continue;
            merged[k] = v;
        }

        const safe = QuickCheckerExtraction.safeParse(merged);
        if (safe.success) return { extraction: safe.data, model_used: MODEL, errors };

        // Final fallback: cast the merged object. With `.default()` on everything the
        // schema should accept almost anything, but just in case Zod still rejects,
        // we still return a usable object.
        errors.push(`Zod validation failed: ${safe.error.issues.slice(0, 3).map(i => `${i.path.join(".")}:${i.message}`).join("; ")}`);
        return { extraction: merged as unknown as QuickCheckerExtraction, model_used: MODEL, errors };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`OpenAI extraction failed: ${msg}`);
        return { extraction: heuristicFallback(input), model_used: null, errors };
    }
}
