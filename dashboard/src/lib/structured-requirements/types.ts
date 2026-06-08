/**
 * Canonical structured_requirements schema — shared across every source-tuned
 * extractor (federal, sled, grants, sbir, ...). One shape, one set of keys,
 * one place to evolve.
 *
 * Previous state (audit 2026-06): three parallel extractors each emitted a
 * different shape into opportunities.structured_requirements:
 *   1. extract-requirements.ts        → flat sentinels {bonding:'Required',...}
 *   2. extract-structured-requirements → {scope_of_work:string,...}
 *   3. analyze_attachments LLM         → {scope_of_work:[],period_of_performance,...}
 * + ~25 typo'd keys from non-validated LLM output (period_of_poformance, etc).
 *
 * Going forward: every extractor MUST return this exact shape. The writer
 * stamps extracted_at + extractor_version so downstream code can tell which
 * pass produced the row.
 *
 * UI consumes via StructuredRequirements.tsx which already handles the
 * canonical keys + a couple of legacy aliases. New code should target these
 * keys exclusively.
 */

export interface PreBidMeeting {
    date?: string;
    mandatory?: boolean;
    location?: string;
}

export interface StructuredRequirements {
    /** Bullet list of scope items. UI renders as <ul>. */
    scope_of_work: string[];
    /** Required qualifications (clearances, certs, past perf). */
    qualifications: string[];
    /** Specific certifications referenced verbatim (ISO 9001, CMMC L2, ...). */
    required_certifications: string[];
    /** Deliverables / artifacts the contractor must produce. */
    deliverables: string[];
    /** "12 months base + 4 option years" — free-form. */
    period_of_performance?: string;
    /** FFP, T&M, CPFF, IDIQ, BPA, ... */
    contract_type?: string;
    /** Evaluation factors / selection criteria (technical approach, past perf, price weighting). */
    evaluation_factors?: string[];
    /** Bid bond as % of proposed value (0-100). Absent if not required. */
    bid_bond_pct?: number;
    /** Performance bond as % of contract value (0-100). Absent if not required. */
    performance_bond_pct?: number;
    /** Pre-bid / pre-proposal conference details. */
    pre_bid_meeting?: PreBidMeeting;
    /** Whether the solicitation gives preference to local / in-state vendors. */
    local_preference?: boolean;
    /** Small-business / set-aside / diversity requirements (8(a), WOSB, HUBZone, SDVOSB). */
    diversity_requirements?: string[];

    // ── Provenance ──────────────────────────────────────────────────────
    /** Which source text fed the extraction. */
    extracted_from: "description" | "attachments" | "both";
    /** ISO timestamp set at write. */
    extracted_at: string;
    /** Extractor identity — e.g. "v1-federal-2026-06". Bumped on prompt edits. */
    extractor_version: string;
}

/* ────────────────────────────────────────────────────────────────────
 * Coercion helpers — shared by every source-specific extractor so
 * un-validated LLM output never reaches the JSONB column. Returns
 * the canonical TS type and drops null-equivalent placeholders the
 * model sometimes hallucinates ("none", "n/a", "tbd", ...).
 * ──────────────────────────────────────────────────────────────────── */

const NULL_PLACEHOLDER = /^(none|not specified|n\/a|null|tbd|unspecified|unknown)$/i;

export function cleanStringArray(v: unknown, max = 12): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
        if (x == null) continue;
        const s = String(x).trim();
        if (!s) continue;
        if (NULL_PLACEHOLDER.test(s)) continue;
        out.push(s.slice(0, 300));
        if (out.length >= max) break;
    }
    return out;
}

export function cleanString(v: unknown, max = 300): string | undefined {
    if (v == null) return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    if (NULL_PLACEHOLDER.test(s)) return undefined;
    return s.slice(0, max);
}

export function cleanPct(v: unknown): number | undefined {
    if (v == null) return undefined;
    if (typeof v === "number" && Number.isFinite(v)) {
        const n = v <= 1 ? v * 100 : v;
        return n >= 0 && n <= 100 ? Number(n.toFixed(2)) : undefined;
    }
    const s = String(v).replace(/[%\s]/g, "");
    const n = Number(s);
    if (!Number.isFinite(n)) return undefined;
    const pct = n <= 1 ? n * 100 : n;
    return pct >= 0 && pct <= 100 ? Number(pct.toFixed(2)) : undefined;
}

export function cleanBool(v: unknown): boolean | undefined {
    if (typeof v === "boolean") return v;
    if (v == null) return undefined;
    const s = String(v).trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "y" || s === "1") return true;
    if (s === "false" || s === "no" || s === "n" || s === "0") return false;
    return undefined;
}

export function cleanPreBidMeeting(v: unknown): PreBidMeeting | undefined {
    if (!v || typeof v !== "object") return undefined;
    const o = v as Record<string, unknown>;
    const date = cleanString(o.date, 80);
    const location = cleanString(o.location, 200);
    const mandatory = cleanBool(o.mandatory);
    if (date === undefined && location === undefined && mandatory === undefined) return undefined;
    const out: PreBidMeeting = {};
    if (date) out.date = date;
    if (location) out.location = location;
    if (mandatory !== undefined) out.mandatory = mandatory;
    return out;
}

