/**
 * Federal (SAM.gov) structured-requirements extractor.
 *
 * Source-tuned successor to the source-agnostic
 * lib/extract-structured-requirements.ts. Designed for the wire format SAM.gov
 * notices use — FAR/DFARS clauses, contract type acronyms, set-aside codes,
 * "Pre-Proposal Conference" sections, evaluation factor lists, base-year +
 * option-year period phrasing.
 *
 * Input may include:
 *   - title, description (always)
 *   - agency (UNCLASSIFIED hint, e.g. "DEPT OF THE NAVY" → looks for NAVAIR/NAVSEA/NAVFAC patterns)
 *   - naics_code (hint)
 *   - set_aside_code (hint — pre-fills diversity_requirements)
 *   - response_deadline (used in evaluation prompt context, not extracted from)
 *   - attachments_text (when an analyze_attachments job already extracted PDF text;
 *     we merge into the same call so the LLM has the richest available context)
 *
 * Output: canonical StructuredRequirements (lib/structured-requirements/types.ts)
 * or null on failure / empty input / no LLM provider configured.
 *
 * Provider cascade: DeepSeek → OpenAI → Ollama. Same as deep-extract — first
 * configured provider wins. JSON mode, temperature 0.2, max 800 output tokens.
 * Inputs capped at ~6KB description + ~6KB attachments to stay under the
 * ~2K-token target.
 */

import { callLLMJson } from "@/lib/llm/deepseek";
import {
    cleanBool,
    cleanPct,
    cleanPreBidMeeting,
    cleanString,
    cleanStringArray,
    type StructuredRequirements,
} from "./types";

export const EXTRACTOR_VERSION = "v1-federal-2026-06";

const MAX_DESC_CHARS = 6_000;
const MAX_ATTACH_CHARS = 6_000;

// Map common SAM set-aside codes → diversity_requirements hint that we
// prepend to the LLM-extracted list (so the field is correct even when the
// description body doesn't repeat the certification name verbatim).
const SET_ASIDE_LABEL: Record<string, string> = {
    "SBA": "Total Small Business Set-Aside",
    "SBP": "Partial Small Business Set-Aside",
    "8A": "8(a) Set-Aside",
    "8AN": "8(a) Sole Source",
    "HZC": "HUBZone Set-Aside",
    "HZS": "HUBZone Sole Source",
    "SDVOSBC": "Service-Disabled Veteran-Owned Set-Aside",
    "SDVOSBS": "Service-Disabled Veteran-Owned Sole Source",
    "VSA": "Veteran-Owned Set-Aside",
    "VSS": "Veteran-Owned Sole Source",
    "WOSB": "Women-Owned Small Business Set-Aside",
    "WOSBSS": "Women-Owned Small Business Sole Source",
    "EDWOSB": "Economically Disadvantaged WOSB Set-Aside",
    "EDWOSBSS": "Economically Disadvantaged WOSB Sole Source",
    "IEE": "Indian Economic Enterprise Set-Aside",
    "ISBEE": "Indian Small Business Economic Enterprise Set-Aside",
};

const SYSTEM_PROMPT = `You are a US federal capture-management analyst. You read a SAM.gov solicitation
(synopsis description + attached documents) and produce a STRUCTURED requirements
breakdown that a small-business proposal team will use to draft a response.

CORE RULES
- Only extract facts SUPPORTED BY THE TEXT. Never invent. Never paraphrase a
  requirement into something it doesn't say.
- "scope_of_work": 3-8 short bullet phrases — the discrete work tasks being procured.
  Example: ["Daily restroom sanitation", "Floor stripping and waxing quarterly", "Trash removal 5 days/week"].
- "qualifications": prime-team qualifications the offeror MUST hold (clearances,
  past-performance thresholds, key personnel certs, registrations).
  Example: ["Active SAM.gov registration", "Secret clearance for project manager", "5 years federal janitorial past performance"].
- "required_certifications": named technical/quality certifications cited
  verbatim in the text (ISO 9001, ISO 27001, CMMC L1/L2/L3, SOC 2, FedRAMP,
  ITAR registration, OSHA-30, EPA Lead-Safe, etc.). Quote the exact name.
- "deliverables": named artifacts/reports the contractor must produce
  (monthly performance reports, transition-in plan, draft IGCE, etc.).
- "period_of_performance": one short phrase, e.g. "Base year + 4 option years",
  "12 months from award", "9/1/2026 – 8/31/2027". Omit if not specified.
- "contract_type": one of FFP, T&M, CPFF, CPIF, IDIQ, BPA, GSA Schedule, or
  null. Look for "Firm-Fixed-Price", "Time-and-Materials", "Cost-Plus-Fixed-Fee",
  "Indefinite Delivery/Indefinite Quantity", "Blanket Purchase Agreement".
- "evaluation_factors": ordered list of selection factors. Example:
  ["Technical Approach", "Past Performance", "Price"]. Include weightings or
  "LPTA" / "Best Value" hints if present.
- "bid_bond_pct" / "performance_bond_pct": integer percentage if a bond is
  required with a stated % of contract value. Common values: 20 (bid), 100
  (performance). Omit if not required.
- "pre_bid_meeting": {date, mandatory, location} — set when the text mentions
  a pre-proposal conference, site visit, or industry day. mandatory=true only
  when the text says "mandatory" or "attendance required".
- "local_preference": true ONLY when the text gives explicit preference to
  in-state / local vendors (rare for federal — usually false).
- "diversity_requirements": set-aside designations cited in the body.
  Example: ["WOSB Set-Aside", "8(a) Sole Source"]. Skip if open competition.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for
empty arrays. Use null for unknown optional scalars. Never add keys we didn't
ask for. Never wrap in markdown.`;

const SCHEMA_HINT = `{
  "scope_of_work": ["string", "..."],
  "qualifications": ["string", "..."],
  "required_certifications": ["string", "..."],
  "deliverables": ["string", "..."],
  "period_of_performance": "string or null",
  "contract_type": "FFP|T&M|CPFF|CPIF|IDIQ|BPA|GSA Schedule|null",
  "evaluation_factors": ["string", "..."],
  "bid_bond_pct": null,
  "performance_bond_pct": null,
  "pre_bid_meeting": { "date": null, "mandatory": false, "location": null },
  "local_preference": false,
  "diversity_requirements": ["string", "..."]
}`;

function stripHtml(s: string | null | undefined): string {
    if (!s) return "";
    return s
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

// Coercion helpers live in ./types.ts so every source extractor uses the
// same null/placeholder filtering. Keeps the JSONB column from collecting
// "tbd" / "n/a" strings that confuse the UI.

export interface FederalExtractInput {
    id?: string;
    title: string | null | undefined;
    description: string | null | undefined;
    agency?: string | null;
    naics_code?: string | null;
    set_aside_code?: string | null;
    response_deadline?: string | null;
    attachments_text?: string | null;
}

export async function extractFederalRequirements(
    opp: FederalExtractInput,
): Promise<StructuredRequirements | null> {
    const title = (opp.title || "").trim();
    const description = stripHtml(opp.description).slice(0, MAX_DESC_CHARS);
    const attachmentsText = stripHtml(opp.attachments_text).slice(0, MAX_ATTACH_CHARS);

    if (!title && !description && !attachmentsText) return null;

    const haveAttachments = attachmentsText.length > 200;
    const extracted_from: StructuredRequirements["extracted_from"] = haveAttachments
        ? (description.length > 200 ? "both" : "attachments")
        : "description";

    const ctx: string[] = [];
    if (opp.agency) ctx.push(`AGENCY: ${opp.agency}`);
    if (opp.naics_code) ctx.push(`NAICS: ${opp.naics_code}`);
    if (opp.set_aside_code) {
        const label = SET_ASIDE_LABEL[opp.set_aside_code.toUpperCase()] || opp.set_aside_code;
        ctx.push(`SET-ASIDE: ${label}`);
    }
    if (opp.response_deadline) ctx.push(`RESPONSE DEADLINE: ${opp.response_deadline}`);

    const userContent = [
        ctx.length ? ctx.join("\n") : "",
        title ? `TITLE: ${title}` : "",
        description ? `DESCRIPTION:\n${description}` : "",
        haveAttachments ? `=== ATTACHMENTS ===\n${attachmentsText}` : "",
    ].filter(Boolean).join("\n\n");

    let raw: Record<string, unknown>;
    try {
        raw = await callLLMJson<Record<string, unknown>>(
            [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "system", content: `JSON SCHEMA (exact keys, no extras):\n${SCHEMA_HINT}` },
                { role: "user", content: userContent },
            ],
            { temperature: 0.2, max_tokens: 800 },
        );
    } catch (err) {
        console.warn(
            `[extract-federal] LLM call failed${opp.id ? ` (opp ${opp.id})` : ""}:`,
            err instanceof Error ? err.message : err,
        );
        return null;
    }

    if (!raw || typeof raw !== "object") return null;

    // Seed diversity_requirements with the set-aside label so the field is
    // populated even when the description body doesn't repeat the cert name.
    const seedDiversity: string[] = [];
    if (opp.set_aside_code) {
        const label = SET_ASIDE_LABEL[opp.set_aside_code.toUpperCase()];
        if (label) seedDiversity.push(label);
    }
    const rawDiversity = cleanStringArray(raw.diversity_requirements);
    const diversity = Array.from(new Set([...seedDiversity, ...rawDiversity]));

    const out: StructuredRequirements = {
        scope_of_work: cleanStringArray(raw.scope_of_work),
        qualifications: cleanStringArray(raw.qualifications),
        required_certifications: cleanStringArray(raw.required_certifications),
        deliverables: cleanStringArray(raw.deliverables),
        diversity_requirements: diversity,
        extracted_from,
        extracted_at: new Date().toISOString(),
        extractor_version: EXTRACTOR_VERSION,
    };

    const pop = cleanString(raw.period_of_performance, 200);
    if (pop) out.period_of_performance = pop;

    const ct = cleanString(raw.contract_type, 40);
    if (ct) out.contract_type = ct;

    const evals = cleanStringArray(raw.evaluation_factors);
    if (evals.length > 0) out.evaluation_factors = evals;

    const bid = cleanPct(raw.bid_bond_pct);
    if (bid !== undefined) out.bid_bond_pct = bid;

    const perf = cleanPct(raw.performance_bond_pct);
    if (perf !== undefined) out.performance_bond_pct = perf;

    const pbm = cleanPreBidMeeting(raw.pre_bid_meeting);
    if (pbm) out.pre_bid_meeting = pbm;

    const local = cleanBool(raw.local_preference);
    if (local !== undefined) out.local_preference = local;

    return out;
}
