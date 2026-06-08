/**
 * Structured-requirements extractor — State (SLED) source.
 *
 * SLED solicitations live on a long tail of state/county/city portals
 * (Bonfire, BidExpress, OpenGov, IonWave, TX SmartBuy, ...) and the
 * description text we end up with is typically:
 *
 *   - the portal's listing blurb (1-3 paragraphs) when scrape_portal_detail
 *     successfully defeated CF, OR
 *   - the RSS title + summary when CF blocked the scrape, OR
 *   - the attached Bid Documents PDF text once analyze_attachments has
 *     OCR'd it (passed in via opp.attachments_text).
 *
 * State procurement is materially different from federal in five ways
 * the prompt must surface:
 *
 *   1. Authority cites state procurement code (e.g. "Texas Gov Code §2155",
 *      "California PCC §22000"), NOT FAR clauses. Don't hallucinate FAR.
 *   2. Diversity is MBE/WBE/DBE/SBE — NOT 8(a)/HUBZone/SDVOSB. Some states
 *      have hybrids ("CA SB micro-business", "TX HUB"). Capture verbatim.
 *   3. Certifications are state-issued (state contractor's license, state
 *      DOT pre-qual, state-specific MBE cert, ASBESTOS class). Capture
 *      verbatim — don't normalize to federal equivalents.
 *   4. Bonding is almost always cited as a dollar amount or % (e.g.
 *      "5% bid bond", "100% performance & payment bond"). Capture % when
 *      stated; the raw dollar amount goes in scope_of_work otherwise.
 *   5. Pre-bid meetings are common and frequently MANDATORY. Capture the
 *      date + whether mandatory + the location/teleconference URL.
 *
 * Returns null when:
 *   - both title + description (and attachments_text) are empty
 *   - OPENAI_API_KEY is unset
 *   - the LLM call fails or returns un-parseable JSON
 *
 * Caller (worker handler) is responsible for stamping extracted_at +
 * extractor_version and persisting to opportunities.structured_requirements.
 */

import {
    type StructuredRequirements,
    cleanString,
    cleanStringArray,
    cleanPct,
    cleanBool,
    cleanPreBidMeeting,
} from "./types";

export const STATE_EXTRACTOR_VERSION = "v1-state-2026-06";

interface ExtractorInput {
    id?: string;
    title: string | null | undefined;
    description: string | null | undefined;
    agency?: string | null;
    naics_code?: string | null;
    set_aside_code?: string | null;
    response_deadline?: string | null;
    attachments_text?: string | null;
}

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

const SYSTEM_PROMPT = `You extract structured procurement requirements from US STATE / LOCAL (SLED) solicitation text. Return JSON ONLY — no prose.

Source: a state/county/city procurement portal listing (often Bonfire, BidExpress, IonWave, OpenGov) plus, when available, the attached Bid Documents PDF text.

CRITICAL RULES:
1. State procurement cites STATE code (e.g. "Texas Gov Code §2155", "CA PCC §22000"). NEVER invent FAR clauses — federal references almost never apply.
2. Diversity at the state level is MBE / WBE / DBE / SBE / HUB / state SB — NOT 8(a)/HUBZone/SDVOSB (those are federal-only). Capture diversity requirements verbatim into diversity_requirements[].
3. Certifications are state-issued — state contractor's license class, state DOT pre-qualification, state-specific MBE certification, asbestos/lead class, etc. Capture VERBATIM into required_certifications[].
4. Bonding: capture bid_bond_pct + performance_bond_pct as numbers in 0-100 when stated as percent. If only a dollar amount is given, include the raw phrase in scope_of_work and leave the *_pct fields out.
5. Pre-bid meeting: state RFPs frequently mandate attendance. Capture pre_bid_meeting.date (raw date string), pre_bid_meeting.mandatory (boolean), pre_bid_meeting.location (in-person address OR teleconference URL).
6. local_preference: true if the doc references local-vendor preference / in-state preference / residence preference; otherwise omit.
7. For each field, return ONLY the literal value found in the text — DO NOT INVENT. Use null or omit when not specified.

OUTPUT SHAPE (omit any key for which no value is in the text):
{
  "scope_of_work": [string, ...],            // 2-8 short bullet phrases of the work being procured
  "qualifications": [string, ...],           // experience minimums, past-perf requirements
  "required_certifications": [string, ...],  // verbatim cert names (state-issued)
  "deliverables": [string, ...],             // artifacts/reports the vendor must produce
  "period_of_performance": string|null,      // e.g. "12 months from NTP + 4 one-year options"
  "contract_type": string|null,              // e.g. "Firm Fixed Price", "Time & Materials", "IDIQ"
  "evaluation_factors": [string, ...],       // selection criteria with weights when given
  "bid_bond_pct": number|null,               // 0-100
  "performance_bond_pct": number|null,       // 0-100
  "pre_bid_meeting": { "date": string|null, "mandatory": boolean|null, "location": string|null }|null,
  "local_preference": boolean|null,
  "diversity_requirements": [string, ...]    // verbatim MBE/WBE/DBE/HUB language
}`;

const FEW_SHOT_USER = `TITLE: RFP 24-085 — Janitorial Services for City Hall Complex
AGENCY: City of Austin, Purchasing Office
NAICS: 561720
RESPONSE DEADLINE: 2026-07-15

DESCRIPTION:
The City of Austin is soliciting proposals for daily janitorial services at the City Hall Complex (three buildings, 240,000 sq ft total) for a 24-month base period with two one-year renewal options. Pursuant to Texas Local Government Code §252, all responses must include a 5% bid bond. The successful proposer shall furnish a 100% performance and payment bond within 10 days of award.

A MANDATORY pre-proposal conference will be held on June 28, 2026 at 10:00 AM CDT at City Hall, 301 W 2nd St, Austin TX, Conference Room 1071. Attendance by an authorized representative of the proposer is required for a response to be considered.

Proposers must hold a current Texas Department of Licensing & Regulation (TDLR) Asbestos Class A license and shall demonstrate a minimum of five (5) years of comparable janitorial experience on government facilities of similar size. Texas HUB-certified businesses and City of Austin certified MBE/WBE firms shall be given preference points (10% of total score). Local-vendor preference applies pursuant to City Code Chapter 2-9.

Selection criteria: Technical Approach (35%), Past Performance (25%), Cost Proposal (25%), HUB/MBE Participation (15%).

Deliverables: monthly performance reports, quarterly inspection logs, annual sustainability report (LEED-compatible).`;

const FEW_SHOT_ASSISTANT = JSON.stringify({
    scope_of_work: [
        "Daily janitorial services for City Hall Complex (three buildings, 240,000 sq ft)",
        "Restroom sanitation, floor maintenance, waste removal",
    ],
    qualifications: [
        "Minimum 5 years comparable janitorial experience on government facilities of similar size",
    ],
    required_certifications: [
        "Texas Department of Licensing & Regulation (TDLR) Asbestos Class A license",
    ],
    deliverables: [
        "Monthly performance reports",
        "Quarterly inspection logs",
        "Annual sustainability report (LEED-compatible)",
    ],
    period_of_performance: "24-month base + two one-year renewal options",
    contract_type: null,
    evaluation_factors: [
        "Technical Approach (35%)",
        "Past Performance (25%)",
        "Cost Proposal (25%)",
        "HUB/MBE Participation (15%)",
    ],
    bid_bond_pct: 5,
    performance_bond_pct: 100,
    pre_bid_meeting: {
        date: "June 28, 2026 at 10:00 AM CDT",
        mandatory: true,
        location: "City Hall, 301 W 2nd St, Austin TX, Conference Room 1071",
    },
    local_preference: true,
    diversity_requirements: [
        "Texas HUB-certified businesses given preference points (10% of total score)",
        "City of Austin certified MBE/WBE firms given preference points (10% of total score)",
    ],
});

function stripHtml(s: string): string {
    return s
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
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

async function callOpenAI(messages: ChatMessage[], timeoutMs = 25000): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages,
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 800,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.warn(`[extract-state] OpenAI ${res.status}: ${body.slice(0, 200)}`);
            return null;
        }
        const j = await res.json() as { choices?: { message?: { content?: string } }[] };
        return j.choices?.[0]?.message?.content || null;
    } catch (e) {
        console.warn("[extract-state] OpenAI call failed:", e instanceof Error ? e.message : e);
        return null;
    }
}

/**
 * Build the user message. We frontload structured metadata so the model
 * grounds its extraction in the right state context even when the
 * description body is sparse.
 */
function buildUserMessage(input: ExtractorInput): { text: string; usedAttachments: boolean } {
    const title = (input.title || "").trim();
    const descClean = stripHtml(input.description || "").slice(0, 4000);
    const attClean = stripHtml(input.attachments_text || "").slice(0, 10_000);
    const usedAttachments = attClean.length > 200;

    const meta: string[] = [];
    if (title) meta.push(`TITLE: ${title}`);
    if (input.agency) meta.push(`AGENCY: ${input.agency}`);
    if (input.naics_code) meta.push(`NAICS: ${input.naics_code}`);
    if (input.set_aside_code) meta.push(`SET-ASIDE: ${input.set_aside_code}`);
    if (input.response_deadline) meta.push(`RESPONSE DEADLINE: ${input.response_deadline}`);

    const parts = [meta.join("\n"), "", "DESCRIPTION:", descClean || "(none)"];
    if (usedAttachments) {
        parts.push("", "ATTACHMENTS TEXT (Bid Documents PDF, OCR):", attClean);
    }
    return { text: parts.join("\n"), usedAttachments };
}

export async function extractStateRequirements(
    opp: ExtractorInput,
): Promise<StructuredRequirements | null> {
    const hasContent =
        (opp.title && opp.title.trim().length > 0) ||
        (opp.description && stripHtml(opp.description).length > 50) ||
        (opp.attachments_text && stripHtml(opp.attachments_text).length > 200);
    if (!hasContent) return null;

    const { text, usedAttachments } = buildUserMessage(opp);
    const hasDescription = (opp.description && stripHtml(opp.description).length > 50) || false;

    const content = await callOpenAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: FEW_SHOT_USER },
        { role: "assistant", content: FEW_SHOT_ASSISTANT },
        { role: "user", content: text },
    ]);
    if (!content) return null;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(content) as Record<string, unknown>;
    } catch (e) {
        console.warn("[extract-state] JSON parse failed:", e instanceof Error ? e.message : e);
        return null;
    }

    const extractedFrom: StructuredRequirements["extracted_from"] = usedAttachments
        ? (hasDescription ? "both" : "attachments")
        : "description";

    const out: StructuredRequirements = {
        scope_of_work: cleanStringArray(parsed.scope_of_work, 10),
        qualifications: cleanStringArray(parsed.qualifications, 10),
        required_certifications: cleanStringArray(parsed.required_certifications, 10),
        deliverables: cleanStringArray(parsed.deliverables, 12),
        extracted_from: extractedFrom,
        // Stamped here so callers always get a complete row, but the
        // worker handler can overwrite both fields before persisting to
        // keep wall-clock + version in lockstep with the actual write.
        extracted_at: new Date().toISOString(),
        extractor_version: STATE_EXTRACTOR_VERSION,
    };

    const period = cleanString(parsed.period_of_performance, 200);
    if (period) out.period_of_performance = period;

    const ctype = cleanString(parsed.contract_type, 60);
    if (ctype) out.contract_type = ctype;

    const evalFactors = cleanStringArray(parsed.evaluation_factors, 12);
    if (evalFactors.length > 0) out.evaluation_factors = evalFactors;

    const bidBond = cleanPct(parsed.bid_bond_pct);
    if (bidBond !== undefined) out.bid_bond_pct = bidBond;

    const perfBond = cleanPct(parsed.performance_bond_pct);
    if (perfBond !== undefined) out.performance_bond_pct = perfBond;

    const meeting = cleanPreBidMeeting(parsed.pre_bid_meeting);
    if (meeting) out.pre_bid_meeting = meeting;

    const local = cleanBool(parsed.local_preference);
    if (local !== undefined) out.local_preference = local;

    const diversity = cleanStringArray(parsed.diversity_requirements, 8);
    if (diversity.length > 0) out.diversity_requirements = diversity;

    // Final sanity: if the model returned zero data across every meaningful
    // field, treat as a no-extraction rather than poisoning the column
    // with an empty shell.
    const hasAnyData =
        out.scope_of_work.length > 0 ||
        out.qualifications.length > 0 ||
        out.required_certifications.length > 0 ||
        out.deliverables.length > 0 ||
        !!out.period_of_performance ||
        !!out.contract_type ||
        (out.evaluation_factors?.length ?? 0) > 0 ||
        out.bid_bond_pct !== undefined ||
        out.performance_bond_pct !== undefined ||
        !!out.pre_bid_meeting ||
        out.local_preference !== undefined ||
        (out.diversity_requirements?.length ?? 0) > 0;
    if (!hasAnyData) return null;

    return out;
}
