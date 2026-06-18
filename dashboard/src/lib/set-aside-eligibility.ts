/**
 * Set-aside eligibility — the SINGLE SOURCE OF TRUTH for the reverse-match
 * (government-buyer) hard gate.
 *
 * NON-NEGOTIABLE RULE: reverse matching must NEVER surface a contractor that is
 * ineligible for an opportunity's set-aside. Not down-ranked, not warned —
 * EXCLUDED. If we cannot positively verify eligibility, we exclude (fail-closed).
 *
 * This is STRICTER than the forward scorer's isSetAsideDisqualified():
 *   - Forward (user-facing): an unrecognized set-aside is NOT disqualifying
 *     (the user self-selects), so it returns false.
 *   - Reverse (buyer-facing): an unrecognized RESTRICTED set-aside means we
 *     can't verify eligibility for anyone → show NOBODY (restricted_unknown).
 *
 * Certification vocabulary (normalized codes):
 *   8A · SDVOSB · VOSB · HUBZONE · WOSB · EDWOSB · TRIBAL_8A
 * The cert substrings mirror isSetAsideDisqualified() so the SQL pre-filter, the
 * JS gate, and the contractor backfill all share one vocabulary (no drift).
 */

export type CertCode = "8A" | "SDVOSB" | "VOSB" | "HUBZONE" | "WOSB" | "EDWOSB" | "TRIBAL_8A";

export type SetAsideClassification =
    | { kind: "unrestricted" }
    | { kind: "restricted"; program: string; requiredLabel: string; satisfyingCodes: CertCode[] }
    | { kind: "restricted_unknown"; raw: string };

// SAM set-aside CODES (opportunities.set_aside_code) → program. Mirrors
// cert-recommendations SET_ASIDE_CERT_MAP. Codes are matched exactly (upper).
const CODE_PROGRAM: Record<string, "8A" | "HUBZONE" | "SDVOSB" | "VOSB" | "WOSB" | "EDWOSB"> = {
    "8A": "8A", "8AN": "8A",
    "HZC": "HUBZONE", "HZS": "HUBZONE",
    "SDVOSBC": "SDVOSB", "SDVOSBS": "SDVOSB",
    "WOSB": "WOSB", "WOSBSS": "WOSB",
    "EDWOSB": "EDWOSB", "EDWOSBSS": "EDWOSB",
    "VSA": "VOSB",
};

// Codes/text that are NOT certification gates (size-based or open). These are
// "unrestricted" for the purposes of the CERT hard gate.
const UNRESTRICTED_CODES = new Set([
    "", "NONE", "N/A", "NA", "O", "OPEN",
    "SBA", "SBP", "SB",            // (total/partial) small business — size, not cert
    "TSB", "TOTAL_SB",
]);

// Program → the satisfying cert codes a contractor needs at least one of, and a
// human label. Hierarchy is encoded here: SDVOSB satisfies a VOSB requirement;
// EDWOSB satisfies a WOSB requirement; tribal/indian is satisfied by TRIBAL_8A
// or 8A. Derived from isSetAsideDisqualified()'s variant lists — keep in sync.
const PROGRAM_REQUIREMENT: Record<string, { label: string; satisfyingCodes: CertCode[] }> = {
    "8A": { label: "8(a)", satisfyingCodes: ["8A"] },
    "SDVOSB": { label: "SDVOSB", satisfyingCodes: ["SDVOSB"] },
    "VOSB": { label: "VOSB", satisfyingCodes: ["VOSB", "SDVOSB"] },
    "HUBZONE": { label: "HUBZone", satisfyingCodes: ["HUBZONE"] },
    "WOSB": { label: "WOSB", satisfyingCodes: ["WOSB", "EDWOSB"] },
    "EDWOSB": { label: "EDWOSB", satisfyingCodes: ["EDWOSB"] },
    // Buy Indian / ISBEE require a VERIFIED Indian Economic Enterprise — a plain
    // 8(a) cert does NOT confer eligibility (25 CFR 1480 / HHSAR 326). So a bare
    // "8A" must NOT satisfy this; only an explicit tribal/IEE cert (TRIBAL_8A).
    "TRIBAL": { label: "Indian Economic Enterprise / Tribal", satisfyingCodes: ["TRIBAL_8A"] },
};

/**
 * Normalize a contractor's SAM certification strings into normalized cert codes.
 * MUST be fed only SAM-authoritative certs (sba_certifications), never the AI
 * capability blob, so free-text marketing ("we serve veteran-owned clients")
 * can't falsely qualify anyone.
 *
 * PROVENANCE (known limitation, tracked): sba_certifications comes from SAM's
 * coreData.businessTypes (certsFromEntity in refresh_sam_registration). SAM is
 * the federal system of record contracting officers use, so this is the right
 * authoritative source. BUT for SDVOSB/VOSB the legally-binding verification
 * now lives in VA VetCert, and SAM's "veteran owned" business type can be
 * self-attested. A future hardening (for the productized gov-buyer tool) should
 * cross-check SDVOSB/VOSB against VA VetCert and WOSB/EDWOSB against the SBA
 * verified-cert date before treating them as gate-passing. Until then the gate
 * trusts SAM registration (matching real procurement practice) and the UI says
 * so. 8(a) is already anchored to the verified SBA program code A6 upstream.
 */
export function normalizeCertCodes(certStrings: (string | null | undefined)[]): CertCode[] {
    const out = new Set<CertCode>();
    for (const raw of certStrings || []) {
        const c = String(raw || "").toLowerCase();
        if (!c) continue;
        if (c.includes("8(a)") || /\b8a\b/.test(c)) out.add("8A");
        if (c.includes("sdvosb") || c.includes("service-disabled") || c.includes("service disabled")) out.add("SDVOSB");
        if (c.includes("vosb") || c.includes("veteran-owned") || c.includes("veteran owned")) out.add("VOSB");
        if (c.includes("hubzone")) out.add("HUBZONE");
        if (c.includes("edwosb") || c.includes("economically disadvantaged women")) out.add("EDWOSB");
        if (c.includes("wosb") || c.includes("women-owned") || c.includes("women owned")) out.add("WOSB");
        if (
            c.includes("indian economic enterprise") || /\biee\b/.test(c) ||
            c.includes("tribal") || c.includes("native american") || c.includes("indian-owned")
        ) out.add("TRIBAL_8A");
    }
    return Array.from(out);
}

/**
 * Classify an opportunity's set-aside into the cert gate it imposes. Accepts the
 * raw set_aside_code AND any descriptive text; we look at both. Fail-closed:
 * a non-empty set-aside we don't recognize as a known program OR as
 * unrestricted is `restricted_unknown` → reverse matching shows nobody.
 */
export function classifyOpportunitySetAside(
    setAsideCode: string | null | undefined,
    setAsideText?: string | null | undefined,
): SetAsideClassification {
    const code = String(setAsideCode || "").trim().toUpperCase();
    const text = String(setAsideText || "").trim().toLowerCase();
    const combined = `${code} ${text}`.trim();

    // Nothing specified → open competition.
    if (!combined) return { kind: "unrestricted" };

    // 1) Exact SAM code match wins.
    if (code && CODE_PROGRAM[code]) {
        const program = CODE_PROGRAM[code];
        const req = PROGRAM_REQUIREMENT[program];
        return { kind: "restricted", program, requiredLabel: req.label, satisfyingCodes: req.satisfyingCodes };
    }

    // 2) Explicit unrestricted / size-only codes.
    if (UNRESTRICTED_CODES.has(code)) return { kind: "unrestricted" };

    // 3) Text-based program detection (mirrors isSetAsideDisqualified substrings).
    const t = `${code.toLowerCase()} ${text}`;
    const unrestrictedText =
        t.includes("no set") || t.includes("none") || t.includes("not a set") ||
        t.includes("unrestricted") || t.includes("full and open") ||
        t.includes("total small business") || t.includes("small business set-aside") ||
        t === "small business" || t.includes("partial small business");
    // Match a program. Order matters: most specific first.
    const matchProgram = (): string | null => {
        if (t.includes("8(a)") || t.includes("8a sole") || /\b8a\b/.test(t)) return "8A";
        if (t.includes("sdvosb") || t.includes("service-disabled") || t.includes("service disabled")) return "SDVOSB";
        if (t.includes("edwosb") || t.includes("economically disadvantaged women")) return "EDWOSB";
        if (t.includes("wosb") || t.includes("women-owned") || t.includes("women owned")) return "WOSB";
        if (t.includes("hubzone")) return "HUBZONE";
        if (t.includes("sdvosb")) return "SDVOSB";
        // Plain "veteran" → VOSB (service-disabled is matched above, so a bare
        // "Veteran Set Aside" maps here, not to SDVOSB).
        if (t.includes("vosb") || t.includes("veteran")) return "VOSB";
        if (t.includes("indian") || t.includes("native american") || t.includes("tribal")) return "TRIBAL";
        return null;
    };
    const program = matchProgram();
    if (program) {
        const req = PROGRAM_REQUIREMENT[program];
        return { kind: "restricted", program, requiredLabel: req.label, satisfyingCodes: req.satisfyingCodes };
    }
    if (unrestrictedText) return { kind: "unrestricted" };

    // 4) Non-empty, unrecognized → FAIL CLOSED.
    return { kind: "restricted_unknown", raw: combined };
}

/**
 * The canonical per-contractor gate. Returns true only when the contractor is
 * positively eligible for the opportunity's set-aside. Fail-closed everywhere:
 *   - unrestricted → always eligible (cert-wise)
 *   - restricted → eligible iff the contractor's SAM cert codes include at least
 *     one satisfying code
 *   - restricted_unknown → NEVER eligible
 * `contractorCertStrings` MUST be SAM-authoritative (sba_certifications).
 */
export function contractorIsEligible(
    contractorCertStrings: (string | null | undefined)[],
    classification: SetAsideClassification,
): boolean {
    if (classification.kind === "unrestricted") return true;
    if (classification.kind === "restricted_unknown") return false;
    const have = new Set(normalizeCertCodes(contractorCertStrings));
    return classification.satisfyingCodes.some((code) => have.has(code));
}
