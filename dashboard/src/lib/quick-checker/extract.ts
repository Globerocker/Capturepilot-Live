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

RULES
- If a field is not clearly supported by the text, return an empty string, null, or empty array.
- Never guess certifications. Return a certification only when the text explicitly mentions it
  (e.g. "Veteran-Owned" → veteran_owned; "SDVOSB certified" → SDVOSB). Put the exact supporting
  quote in 'evidence'.
- Leadership: only real people named on the site with a real title. Mark is_decision_maker=true
  for C-suite, Founder, Owner, President, Partner, Managing Director; false otherwise.
- Capability keywords: extract 8–20 concise phrases buyers would search for (e.g. "managed data
  services", "contract automation"). Tag the 3–5 most central ones as "primary", the rest as
  "secondary". These drive match scoring — be specific, avoid filler like "solutions" or "services".
- Industries served: normalize to noun phrases ("healthcare", "higher education", "construction",
  "oil & gas"). Don't invent industries not mentioned.
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

function heuristicFallback(input: ExtractInput): QuickCheckerExtraction {
    const phones = extractPhones(input.markdown);
    const emails = extractEmails(input.markdown);
    const title = (input.siteName || input.metaTitle || "").split("|")[0].trim();
    return {
        company_name: title,
        dba_name: null,
        tagline: input.metaTitle || null,
        short_description: input.metaDescription || "",
        long_description: input.markdown.slice(0, 1200),
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
        const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT + "\n\nReturn strict JSON matching the schema. No prose, no markdown code fences." },
                { role: "system", content: "Required JSON fields: " + JSON.stringify(Object.keys(QuickCheckerExtraction.shape)) },
                { role: "user", content: userContent },
            ],
        }, { timeout: 45_000 });

        const raw = completion.choices?.[0]?.message?.content || "{}";
        const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        const safe = QuickCheckerExtraction.safeParse(parsed);
        if (safe.success) {
            return { extraction: safe.data, model_used: MODEL, errors };
        }
        // Graceful merge — fill missing required fields from the fallback so the caller still
        // gets a usable object.
        errors.push("OpenAI output failed schema validation — merged with heuristic fallback");
        const fallback = heuristicFallback(input);
        const merged: QuickCheckerExtraction = { ...fallback, ...(parsed as Partial<QuickCheckerExtraction>) };
        const reSafe = QuickCheckerExtraction.safeParse(merged);
        return { extraction: reSafe.success ? reSafe.data : fallback, model_used: MODEL, errors };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`OpenAI extraction failed: ${msg}`);
        return { extraction: heuristicFallback(input), model_used: null, errors };
    }
}
