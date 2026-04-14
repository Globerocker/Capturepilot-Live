/**
 * Structured-requirements extractor.
 *
 * Produces the JSONB payload written to `opportunities.structured_requirements`.
 * The AI-win-strategy cron expects these list-valued keys to be present when
 * available:
 *   - scope_of_work   (list of short bullet items)
 *   - requirements    (list)
 *   - qualifications  (list)
 *   - deliverables    (list)
 *
 * It also emits flat signal fields that the UI tables consume:
 *   - bonding, insurance, clearance_level,
 *     min_experience_years, min_workforce, equipment, certifications_required
 */

const BONDING_RE = /bond(ing|ed|s)?|surety/i;
const INSURANCE_RE = /insurance|liability|workers.?comp|general liability/i;
const CLEARANCE_RE = /(top.?secret|ts\/sci|secret|confidential|public.?trust)\s*(clearance)?/i;
const EXPERIENCE_RE = /(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i;
const WORKFORCE_RE = /minimum\s*(?:of\s+)?(\d+)\s*(?:employees?|workers?|personnel|staff|fte)/i;
const EQUIPMENT_RE = /equipment|vehicle|fleet|machinery|tools|supplies/i;
const CERT_RE = /iso\s*\d+|cmmi|certified|certification|licensed|nist\s*\d+|fedramp|cmmc/i;

// Section headers that introduce structured lists in federal SOWs
const SECTION_REGEX: Record<"scope_of_work" | "requirements" | "qualifications" | "deliverables", RegExp[]> = {
    scope_of_work: [
        /scope\s+of\s+work[:\s.]/i,
        /statement\s+of\s+work[:\s.]/i,
        /\bsow\b[:\s.]/i,
        /performance\s+work\s+statement[:\s.]/i,
        /\bpws\b[:\s.]/i,
        /tasks?[:\s.]/i,
    ],
    requirements: [
        /requirements?[:\s.]/i,
        /contractor\s+shall[:\s.]/i,
        /the\s+contractor\s+must[:\s.]/i,
        /minimum\s+requirements?[:\s.]/i,
    ],
    qualifications: [
        /qualifications?[:\s.]/i,
        /minimum\s+qualifications?[:\s.]/i,
        /required\s+qualifications?[:\s.]/i,
        /contractor\s+qualifications?[:\s.]/i,
        /offeror\s+qualifications?[:\s.]/i,
    ],
    deliverables: [
        /deliverables?[:\s.]/i,
        /deliver(y|ables)\s+schedule[:\s.]/i,
        /cdrl[:\s.]/i,
    ],
};

function extractListAfterSection(text: string, regexes: RegExp[]): string[] {
    // Find the first section hit
    let earliestIdx = -1;
    for (const re of regexes) {
        const m = re.exec(text);
        if (m && (earliestIdx === -1 || m.index < earliestIdx)) earliestIdx = m.index;
    }
    if (earliestIdx < 0) return [];

    // Take up to 3000 chars after the hit, stop at the next ALL-CAPS section header
    const slice = text.slice(earliestIdx, earliestIdx + 3_000);
    const stopMatch = slice.slice(20).match(/\n\s*[A-Z][A-Z\s]{5,40}:/);
    const body = stopMatch ? slice.slice(0, 20 + (stopMatch.index ?? 0)) : slice;

    // Split into candidate items: numbered lists, bullets, or semicolons
    const items: string[] = [];
    const rawItems = body.split(/\n[\s]*(?:\d+\.|\u2022|\*|\-|\(\w\))\s+|;\s*|\n\s*\n/);
    for (const raw of rawItems) {
        const t = raw.replace(/\s+/g, " ").trim();
        if (t.length >= 15 && t.length <= 240 && !/^(scope|requirements?|qualifications?|deliverables?)/i.test(t)) {
            items.push(t);
        }
        if (items.length >= 8) break;
    }
    return items;
}

export interface StructuredRequirements {
    // List fields (consumed by AI win strategy producer)
    scope_of_work?: string[];
    requirements?: string[];
    qualifications?: string[];
    deliverables?: string[];
    // Flat fields (consumed by the UI table)
    bonding: "Required" | "Not Spec.";
    insurance: "Required" | "Not Spec.";
    clearance_level: "Top Secret/SCI" | "Secret" | "Confidential" | "Public Trust" | "Required" | "Not Spec.";
    min_experience_years: number | "Not Spec.";
    min_workforce: number | "Not Spec.";
    equipment: "Required" | "Not Spec.";
    certifications_required: "Yes" | "Not Spec.";
}

export function extractStructuredRequirements(description: string): StructuredRequirements {
    const text = description || "";

    const reqs: StructuredRequirements = {
        bonding: BONDING_RE.test(text) ? "Required" : "Not Spec.",
        insurance: INSURANCE_RE.test(text) ? "Required" : "Not Spec.",
        clearance_level: "Not Spec.",
        min_experience_years: "Not Spec.",
        min_workforce: "Not Spec.",
        equipment: EQUIPMENT_RE.test(text) ? "Required" : "Not Spec.",
        certifications_required: CERT_RE.test(text) ? "Yes" : "Not Spec.",
    };

    const clear = text.match(CLEARANCE_RE);
    if (clear) {
        const cl = clear[0].toLowerCase();
        if (cl.includes("ts/sci") || cl.includes("top secret")) reqs.clearance_level = "Top Secret/SCI";
        else if (cl.includes("secret")) reqs.clearance_level = "Secret";
        else if (cl.includes("confidential")) reqs.clearance_level = "Confidential";
        else if (cl.includes("public trust")) reqs.clearance_level = "Public Trust";
        else reqs.clearance_level = "Required";
    }

    const expMatch = text.match(EXPERIENCE_RE);
    if (expMatch) reqs.min_experience_years = parseInt(expMatch[1]);

    const wfMatch = text.match(WORKFORCE_RE);
    if (wfMatch) reqs.min_workforce = parseInt(wfMatch[1]);

    // Structured lists (only if description is substantial)
    if (text.length > 300) {
        const sow = extractListAfterSection(text, SECTION_REGEX.scope_of_work);
        const requirements = extractListAfterSection(text, SECTION_REGEX.requirements);
        const quals = extractListAfterSection(text, SECTION_REGEX.qualifications);
        const delivs = extractListAfterSection(text, SECTION_REGEX.deliverables);
        if (sow.length > 0) reqs.scope_of_work = sow;
        if (requirements.length > 0) reqs.requirements = requirements;
        if (quals.length > 0) reqs.qualifications = quals;
        if (delivs.length > 0) reqs.deliverables = delivs;
    }

    return reqs;
}
