/**
 * Reconcile crawl data with authoritative federal sources.
 *
 * Phase 3 of the Quick Checker overhaul. The deep-extract pass (Phase 2)
 * produces strong signal about WHAT a company does, but signal about
 * WHO they are (legal name, real certifications, past federal awards,
 * real employee count) only matters if it's verified.
 *
 * This module takes the deep extraction + a SAM UEI (or company name to
 * search by) and returns a `ReconciledProfile` with each field tagged by
 * source — so downstream code (UI badges, HubSpot push, matching gate)
 * can show users which facts came from a primary source (SAM, USAspending)
 * vs the website itself.
 *
 * The killer use case: certifications. A company that claims "veteran-
 * owned" on the homepage isn't actually eligible for SDVOSB set-asides
 * unless the SAM Entity API confirms it. We mark these clearly so the
 * UI can refuse to surface SDVOSB-only opps to unverified claimants
 * (Phase 4 wires the actual filter).
 *
 * No new HTTP infrastructure — reuses existing helpers in
 * lib/quick-checker-helpers.ts (SAM Entity) and lib/usaspending.ts.
 */

import { lookupSamEntity, searchSamByName } from "@/lib/quick-checker-helpers";
import {
    findRecipientHashByUei,
    getRecipientLifetime,
    type RecipientLifetime,
} from "@/lib/usaspending";
import type { QuickCheckerExtraction } from "./schema";

export type FactSource = "sam" | "usaspending" | "crawl" | "missing";

export interface ReconciledField<T> {
    value: T | null;
    source: FactSource;
    /** Free-form note about the reconciliation — surfaced in HubSpot. */
    note?: string;
}

export interface ReconciledProfile {
    company_name: ReconciledField<string>;
    legal_name: ReconciledField<string>;
    uei: ReconciledField<string>;
    cage_code: ReconciledField<string>;
    state: ReconciledField<string>;
    website: ReconciledField<string>;
    /** Certifications VERIFIED against SAM. The website claim is in `crawl_claimed`. */
    verified_certifications: string[];
    /** Certifications the website CLAIMS but SAM doesn't show. Render with a warning. */
    crawl_claimed_unverified: string[];
    /** Combined unique cert list, source-tagged for badge rendering. */
    all_certifications: Array<{ type: string; source: FactSource; verified: boolean }>;
    /** Total federal $ awarded over the company's USAspending lifetime. */
    federal_revenue_lifetime: ReconciledField<number>;
    /** Last fiscal year's federal $ awarded. */
    federal_revenue_last_year: ReconciledField<number>;
    /** Number of federal awards over lifetime. */
    federal_award_count: ReconciledField<number>;
    /** Estimated employee count — SAM doesn't expose, so falls back to crawl. */
    employee_count: ReconciledField<number>;
    /** Year founded. */
    founded_year: ReconciledField<number>;
    /** Whether the company is SAM-registered + active. */
    sam_active: boolean;
    /** Whether USAspending found any federal award history. */
    has_federal_pp: boolean;
    /** Errors/warnings emitted during reconciliation — don't throw, accumulate. */
    notes: string[];
}

const SAM_TO_LOOSE_LABEL: Record<string, RegExp> = {
    "8(a)": /\b8\s*\(?\s*a\)?\b/i,
    "HUBZone": /\bhubzone\b/i,
    "WOSB": /\b(woman|women)[-\s]*owned\b|\bwosb\b/i,
    "EDWOSB": /\bedwosb\b/i,
    "VOSB": /\bveteran[-\s]*owned\b|\bvosb\b/i,
    "SDVOSB": /\bservice[-\s]*disabled\s+veteran\b|\bsdvosb\b/i,
    "SDB": /\bsmall\s+disadvantaged\b|\bsdb\b/i,
    "MBE": /\bminority[-\s]*owned\b|\bmbe\b/i,
};

function looseClaimedCerts(extraction: QuickCheckerExtraction): string[] {
    const claims = new Set<string>();
    for (const c of extraction.certifications) {
        const raw = (c.type || "").toUpperCase();
        // Direct token match
        if (raw === "8(A)" || raw === "8A") claims.add("8(a)");
        else if (["HUBZONE", "WOSB", "EDWOSB", "VOSB", "SDVOSB", "SDB", "MBE"].includes(raw)) claims.add(raw);
        else if (raw === "VETERAN_OWNED") claims.add("VOSB");
        else if (raw === "WOMAN_OWNED" || raw === "WOMEN_OWNED") claims.add("WOSB");
        else {
            // Fuzzy match against evidence text
            const haystack = `${c.type} ${c.evidence || ""}`.toLowerCase();
            for (const [label, rx] of Object.entries(SAM_TO_LOOSE_LABEL)) {
                if (rx.test(haystack)) claims.add(label);
            }
        }
    }
    return Array.from(claims);
}

export interface ReconcileInput {
    extraction: QuickCheckerExtraction;
    /** Known UEI. If absent we'll try SAM name search using extraction.company_name. */
    uei?: string | null;
    /** Optional explicit company name override (e.g. user-provided). */
    companyName?: string | null;
}

export async function reconcileProfile(input: ReconcileInput): Promise<ReconciledProfile> {
    const notes: string[] = [];
    const ex = input.extraction;
    const fallbackName = (input.companyName || ex.company_name || "").trim();

    // ── 1) SAM lookup (by UEI or name → UEI → entity) ────────────────────
    let samEntity: Awaited<ReturnType<typeof lookupSamEntity>> = null;
    let samUei: string | null = (input.uei || "").trim() || null;
    if (samUei) {
        samEntity = await lookupSamEntity(samUei);
        if (!samEntity) notes.push(`SAM UEI ${samUei} not found or not Active.`);
    } else if (fallbackName) {
        const discovered = await searchSamByName(fallbackName);
        if (discovered) {
            samUei = discovered;
            samEntity = await lookupSamEntity(discovered);
            if (samEntity) notes.push(`SAM UEI ${discovered} matched via legal name search.`);
        } else {
            notes.push("No SAM UEI found via name search — company may not be registered.");
        }
    }
    const samActive = !!samEntity;

    // ── 2) USAspending lookup (only if we have a UEI) ────────────────────
    let usaLifetime: RecipientLifetime | null = null;
    if (samUei && fallbackName) {
        try {
            const recip = await findRecipientHashByUei({ uei: samUei, companyName: fallbackName });
            if (recip) {
                usaLifetime = await getRecipientLifetime(recip.hash);
                if (!usaLifetime) notes.push(`USAspending recipient found (${recip.hash}) but lifetime fetch failed.`);
            } else {
                notes.push("USAspending: no federal awards on record (zero past performance).");
            }
        } catch (err) {
            notes.push(`USAspending lookup error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // ── 3) Reconcile certifications: SAM is authoritative ────────────────
    const samCerts = (samEntity?.sba_certifications || []).map(c => c.toUpperCase() === "8(A)" ? "8(a)" : c);
    const claimedCerts = looseClaimedCerts(ex);
    const verified: string[] = [];
    const unverified: string[] = [];
    const samSet = new Set(samCerts.map(c => c.toUpperCase()));
    for (const c of claimedCerts) {
        if (samSet.has(c.toUpperCase())) verified.push(c);
        else unverified.push(c);
    }
    // Also include SAM-only certs (rare but possible — old certs the site doesn't mention)
    for (const c of samCerts) {
        if (!verified.includes(c)) verified.push(c);
    }
    const allCerts = [
        ...verified.map(type => ({ type, source: "sam" as FactSource, verified: true })),
        ...unverified.map(type => ({ type, source: "crawl" as FactSource, verified: false })),
    ];

    if (unverified.length > 0) {
        notes.push(`Site claims certifications not verified in SAM: ${unverified.join(", ")}. Manual verification required before bidding on these set-asides.`);
    }

    // ── 4) Pick best value for each field ───────────────────────────────
    const samState = samEntity?.state || "";
    const crawlState = ex.headquarters_state || "";
    const state: ReconciledField<string> = samState
        ? { value: samState, source: "sam" }
        : crawlState
            ? { value: crawlState, source: "crawl", note: "From website (may be marketing HQ, not SAM legal address)" }
            : { value: null, source: "missing" };

    const legalName: ReconciledField<string> = samEntity?.company_name
        ? { value: samEntity.company_name, source: "sam" }
        : { value: ex.company_name || null, source: ex.company_name ? "crawl" : "missing" };

    const usaLastYear: number | null = (() => {
        if (!usaLifetime) return null;
        // RecipientLifetime exposes total only — last-year requires a second call.
        // For now we leave this null and surface only lifetime; if/when we
        // wire getSpendingOverTime here, set it. Avoid faking signal.
        return null;
    })();

    return {
        company_name: { value: ex.company_name || fallbackName || null, source: ex.company_name ? "crawl" : (fallbackName ? "crawl" : "missing") },
        legal_name: legalName,
        uei: samUei ? { value: samUei, source: "sam" } : { value: null, source: "missing" },
        cage_code: samEntity?.cage_code ? { value: samEntity.cage_code, source: "sam" } : { value: null, source: "missing" },
        state,
        website: samEntity?.website ? { value: samEntity.website, source: "sam" } : { value: null, source: "missing" },
        verified_certifications: verified,
        crawl_claimed_unverified: unverified,
        all_certifications: allCerts,
        federal_revenue_lifetime: usaLifetime
            ? { value: usaLifetime.total_transaction_amount, source: "usaspending" }
            : { value: null, source: "missing" },
        federal_revenue_last_year: { value: usaLastYear, source: usaLastYear ? "usaspending" : "missing" },
        federal_award_count: usaLifetime
            ? { value: usaLifetime.total_transactions, source: "usaspending" }
            : { value: null, source: "missing" },
        employee_count: ex.employee_count_estimate
            ? { value: ex.employee_count_estimate, source: "crawl", note: "Estimated from website signals (team page, careers)" }
            : { value: null, source: "missing" },
        founded_year: ex.founded_year
            ? { value: ex.founded_year, source: "crawl" }
            : { value: null, source: "missing" },
        sam_active: samActive,
        has_federal_pp: !!usaLifetime && usaLifetime.total_transactions > 0,
        notes,
    };
}
