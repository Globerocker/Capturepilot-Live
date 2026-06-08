/**
 * County-source structured_requirements extractor.
 *
 * County procurements are typically shorter than state RFPs and lean heavily
 * on the county's own procurement code: local preference, small-business
 * preference, bid bond, performance bond, insurance minimums, and a tight
 * scope-of-work section. Many counties paste boilerplate from their general
 * terms ordinance, so the prompt is tuned to ignore standard county-code
 * preamble and pull only the bid-specific facts.
 *
 * Returns the canonical {@link StructuredRequirements} shape, or null when
 *   - description is empty,
 *   - OPENAI_API_KEY is unset, or
 *   - the LLM call fails / returns unparseable JSON.
 *
 * The caller (worker_jobs handler) is responsible for writing the payload
 * into opportunities.structured_requirements with extracted_at + extractor_version
 * already stamped here. We DO NOT merge with prior payloads — that's the
 * caller's choice based on whether attachments have run yet.
 */

import type { StructuredRequirements } from "./types";

export const COUNTY_EXTRACTOR_VERSION = "v1-county-2026-06";

const MODEL = process.env.STRUCTURED_REQS_MODEL || "gpt-4o-mini";
const MAX_DESCRIPTION_CHARS = 6_000;
const MAX_ATTACHMENT_CHARS = 18_000;

const SYSTEM_PROMPT = `You extract structured procurement requirements from US COUNTY government RFPs / IFBs / RFQs.

CONTEXT — county procurements differ from state and federal:
- Shorter than state; often a single PDF + a 1-page web summary.
- Bound by the county procurement code (local-preference ordinances, small-business
  preference, prevailing-wage rules). When you see "Section X of County Code" or
  "the County's Local Preference Ordinance", that signals local_preference=true.
- Bonds are common: bid bond (typically 5%), performance bond (typically 100%),
  payment bond (100%). Express as integer percentage (5, 100). Skip if absent.
- Insurance minimums usually live in the qualifications section ("$1M GL,
  $2M Aggregate, Workers Comp per State law"). Keep those as ONE qualification line.
- Pre-bid meetings are common; mark mandatory=true only when the text says
  "MANDATORY", "REQUIRED ATTENDANCE", or "FAILURE TO ATTEND DISQUALIFIES".
- Set-aside / diversity language is local: MBE, WBE, DBE, SBE, LBE, Section 3.
  Capture verbatim into diversity_requirements.

RULES
- Never invent. If a field is not stated in the text, omit it (don't return null,
  don't return "Not Specified"). For required arrays, return [].
- scope_of_work: 3-10 short bullet strings of WORK BEING PROCURED — what the
  contractor will DO. Skip background, history, "the County's mission" filler.
- qualifications: bidder requirements (license, insurance, years experience,
  bonding capacity, references). Each item ≤ 25 words.
- required_certifications: explicit certifications named in the text
  (ISO 9001, LEED AP, OSHA 30, state contractor's license number, …). Exact
  wording from the doc.
- deliverables: tangible artifacts (reports, plans, software, completed
  construction phases, monthly invoices, …).
- period_of_performance: free-form ("12 months from NTP", "Base year + 4 options").
- contract_type: lump-sum, unit-price, T&M, IDIQ, requirements contract, FFP, etc.
- evaluation_factors: selection criteria with weights when given
  ("Technical Approach 40%", "Past Performance 30%", "Price 30%").
- bid_bond_pct / performance_bond_pct: integer % only. Skip if not required.
- pre_bid_meeting: {date?, mandatory?, location?}. Use ISO-8601 date when
  parseable; otherwise the verbatim string. Omit pre_bid_meeting entirely if
  no meeting is mentioned.
- local_preference: true only when the doc references a county local-preference
  ordinance or in-county vendor scoring credit. Omit if silent.
- diversity_requirements: capture set-aside / MBE / WBE / DBE / SBE / LBE /
  Section 3 / veteran preferences verbatim. Each item ≤ 30 words.

Output ONLY a JSON object with the keys above (omit anything you can't support).
No prose, no markdown fences.`;

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

async function callOpenAI(
    messages: ChatMessage[],
    timeoutMs = 25_000,
): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 800,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            console.warn(`[extract-county] OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
            return null;
        }
        const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return j.choices?.[0]?.message?.content || null;
    } catch (e) {
        console.warn(`[extract-county] OpenAI call failed:`, e instanceof Error ? e.message : e);
        return null;
    }
}

function stripHtml(s: string): string {
    return s
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanStringArray(v: unknown, maxItems = 12, maxLen = 280): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
        if (out.length >= maxItems) break;
        const s = String(x ?? "").trim();
        if (!s) continue;
        if (/^(none|not specified|n\/a|null|tbd)$/i.test(s)) continue;
        out.push(s.slice(0, maxLen));
    }
    return out;
}

function strOrUndef(v: unknown, maxLen = 300): string | undefined {
    if (v == null) return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    if (/^(none|not specified|n\/a|null|tbd)$/i.test(s)) return undefined;
    return s.slice(0, maxLen);
}

function pctOrUndef(v: unknown): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return undefined;
    if (n <= 0 || n > 100) return undefined;
    return Math.round(n);
}

function boolOrUndef(v: unknown): boolean | undefined {
    if (v === true || v === false) return v;
    if (typeof v === "string") {
        if (/^(true|yes|required|mandatory)$/i.test(v.trim())) return true;
        if (/^(false|no|not required|n\/a)$/i.test(v.trim())) return false;
    }
    return undefined;
}

function meetingOrUndef(v: unknown): StructuredRequirements["pre_bid_meeting"] {
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const m = v as Record<string, unknown>;
    const out: NonNullable<StructuredRequirements["pre_bid_meeting"]> = {};
    const d = strOrUndef(m.date, 80);
    if (d) out.date = d;
    const mand = boolOrUndef(m.mandatory);
    if (mand !== undefined) out.mandatory = mand;
    const loc = strOrUndef(m.location, 200);
    if (loc) out.location = loc;
    return Object.keys(out).length > 0 ? out : undefined;
}

export interface CountyExtractorInput {
    id?: string;
    title?: string | null;
    description?: string | null;
    agency?: string | null;
    naics_code?: string | null;
    set_aside_code?: string | null;
    response_deadline?: string | null;
    /** Pre-fetched text from analyze_attachments path, when available. */
    attachments_text?: string | null;
}

export async function extractCountyRequirements(
    opp: CountyExtractorInput,
): Promise<StructuredRequirements | null> {
    const title = (opp.title || "").trim();
    const description = stripHtml(opp.description || "").slice(0, MAX_DESCRIPTION_CHARS);
    const attachmentsText = (opp.attachments_text || "").trim().slice(0, MAX_ATTACHMENT_CHARS);

    // Nothing to extract from
    if (!title && !description && !attachmentsText) return null;

    const extractedFrom: StructuredRequirements["extracted_from"] =
        attachmentsText && description ? "both"
            : attachmentsText ? "attachments"
                : "description";

    const userPayload = [
        title ? `TITLE: ${title}` : "",
        opp.agency ? `AGENCY: ${opp.agency}` : "",
        opp.naics_code ? `NAICS: ${opp.naics_code}` : "",
        opp.set_aside_code ? `SET_ASIDE: ${opp.set_aside_code}` : "",
        opp.response_deadline ? `RESPONSE_DEADLINE: ${opp.response_deadline}` : "",
        "",
        description ? `DESCRIPTION:\n${description}` : "",
        attachmentsText ? `\n\n=== ATTACHMENT TEXT (truncated) ===\n${attachmentsText}` : "",
    ].filter(Boolean).join("\n");

    const content = await callOpenAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload },
    ]);
    if (!content) return null;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(content);
    } catch {
        console.warn(`[extract-county] unparseable JSON (${content.length} chars) for opp ${opp.id || "?"}`);
        return null;
    }

    const result: StructuredRequirements = {
        scope_of_work: cleanStringArray(parsed.scope_of_work, 12, 280),
        qualifications: cleanStringArray(parsed.qualifications, 12, 280),
        required_certifications: cleanStringArray(parsed.required_certifications, 10, 200),
        deliverables: cleanStringArray(parsed.deliverables, 12, 280),
        extracted_from: extractedFrom,
        extracted_at: new Date().toISOString(),
        extractor_version: COUNTY_EXTRACTOR_VERSION,
    };

    const pop = strOrUndef(parsed.period_of_performance, 200);
    if (pop) result.period_of_performance = pop;

    const ctype = strOrUndef(parsed.contract_type, 80);
    if (ctype) result.contract_type = ctype;

    const ef = cleanStringArray(parsed.evaluation_factors, 10, 200);
    if (ef.length > 0) result.evaluation_factors = ef;

    const bb = pctOrUndef(parsed.bid_bond_pct);
    if (bb !== undefined) result.bid_bond_pct = bb;

    const pb = pctOrUndef(parsed.performance_bond_pct);
    if (pb !== undefined) result.performance_bond_pct = pb;

    const meet = meetingOrUndef(parsed.pre_bid_meeting);
    if (meet) result.pre_bid_meeting = meet;

    const lp = boolOrUndef(parsed.local_preference);
    if (lp !== undefined) result.local_preference = lp;

    const dr = cleanStringArray(parsed.diversity_requirements, 8, 240);
    if (dr.length > 0) result.diversity_requirements = dr;

    // Cheap sanity gate — if the model gave us nothing useful, return null so
    // the worker doesn't merge an effectively-empty payload over a richer one.
    const hasContent =
        result.scope_of_work.length > 0 ||
        result.qualifications.length > 0 ||
        result.required_certifications.length > 0 ||
        result.deliverables.length > 0 ||
        !!result.period_of_performance ||
        !!result.contract_type;
    if (!hasContent) return null;

    return result;
}
