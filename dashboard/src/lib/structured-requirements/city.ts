/**
 * Source-tuned structured-requirements extractor — CITY (municipal).
 *
 * Targets opportunities where jurisdiction_level='city' (and typically
 * source='sled'). Municipal RFPs/IFBs/RFQs differ from federal procurements
 * along several dimensions the prompt has to surface:
 *
 *   - Local hire / local preference / residency clauses (these almost never
 *     appear federally but are extremely common in city contracts and they
 *     materially affect win-probability for out-of-area bidders).
 *   - Living-wage ordinances tied to the municipal code (e.g. Berkeley LWO,
 *     LA Living Wage, NYC §6-109).
 *   - Small / minority / women / disadvantaged business enterprise programs
 *     (MBE / WBE / DBE / SLBE / VOSB) — local variants of federal set-asides
 *     keyed to the city's own certifying body.
 *   - Insurance and bond requirements — often flat-dollar minimums rather
 *     than the percentage-of-value the feds use.
 *   - Pre-bid meeting cadence, often mandatory and walk-the-site for
 *     facilities/maintenance work.
 *   - Plain "scope of work" + "deliverables" as a bid package, not a
 *     federal-style PWS.
 *
 * Returns null when description is empty, OPENAI_API_KEY unset, or the
 * AI call fails. Caller is responsible for persisting into
 * opportunities.structured_requirements JSONB.
 *
 * Output shape: the canonical StructuredRequirements interface in ./types.
 * Provenance fields (extracted_from / extracted_at / extractor_version) are
 * stamped here so the worker handler doesn't have to know about them.
 */

import type { StructuredRequirements, PreBidMeeting } from "./types";

const EXTRACTOR_VERSION = "v1-city-2026-06";

export interface CityOppInput {
    id?: string;
    title?: string | null;
    description?: string | null;
    agency?: string | null;
    naics_code?: string | null;
    set_aside_code?: string | null;
    response_deadline?: string | null;
    /** Optional pre-extracted attachment text (PDF/DOCX → plaintext). When
     *  present the prompt is fed both description + attachments and the
     *  resulting record carries extracted_from='both'. */
    attachments_text?: string | null;
}

const SYSTEM_PROMPT = `You extract structured procurement requirements from US city / municipal solicitations (RFP, IFB, RFQ, RFI, ITB). Return JSON only — no prose, no markdown fences. Use the exact field names below. For any field where the text does not specify a value, OMIT THE KEY entirely (do not return null, empty string, or "N/A"). Arrays must contain short, verbatim-faithful phrases — never invent or paraphrase requirements that are not in the source text.

Pay particular attention to municipal-specific signals:
- Local hire / local preference / residency clauses (set local_preference=true when present)
- Living-wage ordinances and prevailing-wage references (capture in qualifications)
- MBE / WBE / DBE / SLBE / VOSB / SBE participation goals (capture in diversity_requirements as e.g. "MBE goal: 15%")
- Insurance minimums (general liability, auto, workers comp dollar minimums → qualifications)
- Bond requirements as percentages (bid_bond_pct and performance_bond_pct as 0-100 numbers)
- Pre-bid meetings — set pre_bid_meeting.mandatory=true only when the text explicitly says "mandatory" or "required attendance"
- Contract type: FFP, T&M, unit-price, requirements contract, IDIQ, JOC

Schema:
{
  "scope_of_work": string[],            // 3-8 bullet phrases summarising what's being procured
  "qualifications": string[],           // licenses, experience, insurance, wage compliance
  "required_certifications": string[],  // verbatim cert names (e.g. "ISO 9001", "OSHA 30")
  "deliverables": string[],             // artifacts the vendor must produce
  "period_of_performance": string,      // free-form, e.g. "1 year base + 2 option years"
  "contract_type": string,
  "evaluation_factors": string[],
  "bid_bond_pct": number,               // 0-100, omit if not specified
  "performance_bond_pct": number,       // 0-100, omit if not specified
  "pre_bid_meeting": { "date": string, "mandatory": boolean, "location": string },
  "local_preference": boolean,
  "diversity_requirements": string[]
}`;

const FEW_SHOT_USER = `TITLE: Janitorial Services for City Hall and Public Library
AGENCY: City of Oakland — Department of Public Works
DESCRIPTION:
The City of Oakland is soliciting bids for janitorial services at City Hall (1 Frank Ogawa Plaza) and the Main Public Library. The contract term shall be one (1) year base with two (2) one-year options to renew. Vendors must comply with the Oakland Living Wage Ordinance (OMC §2.28). A 15% Local Business Enterprise (LBE) participation goal applies and Oakland-certified MBE/WBE firms receive a 10% bid discount. A mandatory pre-bid walkthrough is scheduled for March 5, 2026 at 10:00 AM at City Hall, Room 250. Bidders must provide a bid bond of 10% of the bid amount and the successful bidder shall furnish a performance bond equal to 100% of the contract value. Required insurance: $2,000,000 general liability, $1,000,000 auto, statutory workers' compensation. Bidders shall hold a valid California janitorial contractor license and demonstrate three (3) years of comparable municipal experience. Monthly performance reports and a quarterly chemical inventory log are required. Evaluation: price (40%), experience (30%), local participation (20%), references (10%).`;

const FEW_SHOT_ASSISTANT = JSON.stringify({
    scope_of_work: [
        "Janitorial services at Oakland City Hall (1 Frank Ogawa Plaza)",
        "Janitorial services at the Main Public Library",
        "Routine cleaning, restocking, and chemical handling per municipal standards",
    ],
    qualifications: [
        "Valid California janitorial contractor license",
        "3 years comparable municipal janitorial experience",
        "Compliance with Oakland Living Wage Ordinance (OMC §2.28)",
        "$2M general liability insurance",
        "$1M auto insurance",
        "Statutory workers' compensation insurance",
    ],
    required_certifications: [],
    deliverables: [
        "Monthly performance reports",
        "Quarterly chemical inventory log",
    ],
    period_of_performance: "1 year base + 2 one-year options",
    contract_type: "FFP",
    evaluation_factors: [
        "Price (40%)",
        "Experience (30%)",
        "Local participation (20%)",
        "References (10%)",
    ],
    bid_bond_pct: 10,
    performance_bond_pct: 100,
    pre_bid_meeting: {
        date: "2026-03-05T10:00:00",
        mandatory: true,
        location: "Oakland City Hall, Room 250",
    },
    local_preference: true,
    diversity_requirements: [
        "LBE participation goal: 15%",
        "Oakland-certified MBE/WBE 10% bid discount",
    ],
});

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

async function callOpenAI(messages: ChatMessage[], timeoutMs = 25_000): Promise<string | null> {
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
                temperature: 0.2,
                max_tokens: 800,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return j.choices?.[0]?.message?.content || null;
    } catch {
        return null;
    }
}

function stripHtml(s: string): string {
    return s
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

function cleanStr(v: unknown, max = 300): string | undefined {
    if (v == null) return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    if (/^(none|not specified|n\/?a|null|unknown|tbd)$/i.test(s)) return undefined;
    return s.slice(0, max);
}

function cleanArr(v: unknown, maxItems = 15, maxLen = 240): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const item of v) {
        const s = cleanStr(item, maxLen);
        if (s) out.push(s);
        if (out.length >= maxItems) break;
    }
    return out;
}

function cleanPct(v: unknown): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return undefined;
    if (n < 0 || n > 100) return undefined;
    return Math.round(n * 100) / 100;
}

function cleanBool(v: unknown): boolean | undefined {
    if (v === true || v === false) return v;
    if (typeof v === "string") {
        if (/^(true|yes|y|1)$/i.test(v.trim())) return true;
        if (/^(false|no|n|0)$/i.test(v.trim())) return false;
    }
    return undefined;
}

function cleanPreBid(v: unknown): PreBidMeeting | undefined {
    if (!v || typeof v !== "object") return undefined;
    const obj = v as Record<string, unknown>;
    const date = cleanStr(obj.date, 80);
    const location = cleanStr(obj.location, 240);
    const mandatory = cleanBool(obj.mandatory);
    if (!date && !location && mandatory === undefined) return undefined;
    const out: PreBidMeeting = {};
    if (date) out.date = date;
    if (location) out.location = location;
    if (mandatory !== undefined) out.mandatory = mandatory;
    return out;
}

export async function extractCityRequirements(
    opp: CityOppInput,
): Promise<StructuredRequirements | null> {
    const title = (opp.title || "").trim();
    const description = stripHtml(opp.description || "").slice(0, 6000);
    const attachments = opp.attachments_text ? stripHtml(opp.attachments_text).slice(0, 8000) : "";
    if (!title && !description && !attachments) return null;

    const lines: string[] = [];
    if (title) lines.push(`TITLE: ${title}`);
    if (opp.agency) lines.push(`AGENCY: ${opp.agency}`);
    if (opp.naics_code) lines.push(`NAICS: ${opp.naics_code}`);
    if (opp.set_aside_code) lines.push(`SET-ASIDE: ${opp.set_aside_code}`);
    if (opp.response_deadline) lines.push(`RESPONSE DEADLINE: ${opp.response_deadline}`);
    lines.push("DESCRIPTION:", description || "(none)");
    if (attachments) {
        lines.push("", "=== ATTACHMENT TEXT ===", attachments);
    }
    const userMessage = lines.join("\n");

    const content = await callOpenAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: FEW_SHOT_USER },
        { role: "assistant", content: FEW_SHOT_ASSISTANT },
        { role: "user", content: userMessage },
    ]);
    if (!content) return null;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
        return null;
    }

    const extractedFrom: StructuredRequirements["extracted_from"] = attachments
        ? (description ? "both" : "attachments")
        : "description";

    const result: StructuredRequirements = {
        scope_of_work: cleanArr(parsed.scope_of_work, 12),
        qualifications: cleanArr(parsed.qualifications, 15),
        required_certifications: cleanArr(parsed.required_certifications, 12),
        deliverables: cleanArr(parsed.deliverables, 12),
        extracted_from: extractedFrom,
        extracted_at: new Date().toISOString(),
        extractor_version: EXTRACTOR_VERSION,
    };

    const period = cleanStr(parsed.period_of_performance, 200);
    if (period) result.period_of_performance = period;

    const ctype = cleanStr(parsed.contract_type, 60);
    if (ctype) result.contract_type = ctype;

    const evalArr = cleanArr(parsed.evaluation_factors, 10);
    if (evalArr.length) result.evaluation_factors = evalArr;

    const bidBond = cleanPct(parsed.bid_bond_pct);
    if (bidBond !== undefined) result.bid_bond_pct = bidBond;

    const perfBond = cleanPct(parsed.performance_bond_pct);
    if (perfBond !== undefined) result.performance_bond_pct = perfBond;

    const pb = cleanPreBid(parsed.pre_bid_meeting);
    if (pb) result.pre_bid_meeting = pb;

    const lp = cleanBool(parsed.local_preference);
    if (lp !== undefined) result.local_preference = lp;

    const diversity = cleanArr(parsed.diversity_requirements, 10);
    if (diversity.length) result.diversity_requirements = diversity;

    return result;
}

export const __cityExtractorMeta = {
    version: EXTRACTOR_VERSION,
    model: "gpt-4o-mini",
    source: "city",
};
