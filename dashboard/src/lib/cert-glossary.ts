/**
 * cert-glossary — a static map of SBA / federal contracting certification codes
 * to a human label + a one-line plain-English blurb, for tooltips on the cockpit
 * (and anywhere a raw cert code like "8(a)" or "SDVOSB" shows up).
 *
 * Keys are matched case-insensitively and after stripping spaces/dots/dashes, so
 * "8(a)", "8A", "8 a" all resolve to the same entry. Use certInfo(code) — it does
 * the normalization + a few common alias fallbacks for you.
 */

export interface CertInfo {
    /** Short display label (canonical form, e.g. "8(a)", "SDVOSB"). */
    label: string;
    /** One-line plain-English explanation for a tooltip. */
    blurb: string;
}

/**
 * Canonical glossary keyed by a NORMALIZED code (lowercase, alphanumerics only).
 * Always look entries up through certInfo() so callers don't have to normalize.
 */
export const CERT_GLOSSARY: Record<string, CertInfo> = {
    // ── SBA socioeconomic programs ──────────────────────────────────────────
    "8a": {
        label: "8(a)",
        blurb: "SBA 8(a) Business Development program for socially & economically disadvantaged small businesses — eligible for sole-source awards up to $4.5M (services) / $7M (manufacturing).",
    },
    hubzone: {
        label: "HUBZone",
        blurb: "Historically Underutilized Business Zone — small business based in (and employing from) a HUBZone. Gets a 10% price-evaluation preference plus set-aside and sole-source eligibility.",
    },
    wosb: {
        label: "WOSB",
        blurb: "Woman-Owned Small Business — at least 51% owned/controlled by women. Eligible for WOSB set-asides in industries where women are underrepresented.",
    },
    edwosb: {
        label: "EDWOSB",
        blurb: "Economically Disadvantaged Woman-Owned Small Business — a WOSB whose owners also meet SBA economic-disadvantage limits. Eligible for EDWOSB set-asides.",
    },
    sdvosb: {
        label: "SDVOSB",
        blurb: "Service-Disabled Veteran-Owned Small Business — at least 51% owned/controlled by service-disabled veterans. Eligible for SDVOSB set-aside and sole-source awards (VA verifies via SBA).",
    },
    vosb: {
        label: "VOSB",
        blurb: "Veteran-Owned Small Business — at least 51% owned/controlled by veterans. Gets priority on VA contracts under the Vets-First program.",
    },
    sdb: {
        label: "SDB",
        blurb: "Small Disadvantaged Business — at least 51% owned by socially & economically disadvantaged individuals. Counts toward agency SDB contracting goals.",
    },
    sb: {
        label: "Small Business",
        blurb: "Small Business — meets the SBA size standard for its primary NAICS code. Eligible for small-business set-asides.",
    },
    vetbiz: {
        label: "Vets-First / VetBiz",
        blurb: "VA Vets-First Verification — a VOSB/SDVOSB verified in the SBA VetCert (formerly VetBiz / VIP) registry, required to win VA veteran set-asides.",
    },
    asbc: {
        label: "Ability One",
        blurb: "AbilityOne — nonprofit employing people who are blind or have significant disabilities; eligible for AbilityOne procurement-list awards.",
    },
    "ant": {
        label: "Alaska Native / Tribal",
        blurb: "Alaska Native Corporation (ANC) / Tribally-owned 8(a) firm — special sole-source authority with no dollar ceiling under the 8(a) program.",
    },

    // ── Quality / process maturity standards ────────────────────────────────
    iso9001: {
        label: "ISO 9001",
        blurb: "ISO 9001 — internationally recognized quality-management-system certification. Signals documented, audited quality processes, often required on services contracts.",
    },
    iso27001: {
        label: "ISO 27001",
        blurb: "ISO/IEC 27001 — information-security-management-system certification. Signals audited security controls, often required on IT / data contracts.",
    },
    iso14001: {
        label: "ISO 14001",
        blurb: "ISO 14001 — environmental-management-system certification. Relevant on facilities, construction, and environmental services work.",
    },
    cmmi: {
        label: "CMMI",
        blurb: "Capability Maturity Model Integration — an appraised process-maturity level (1-5) for software/systems engineering. Higher levels are often required on large IT contracts.",
    },
    cmmc: {
        label: "CMMC",
        blurb: "Cybersecurity Maturity Model Certification — DoD's tiered cyber-hygiene certification required of contractors handling FCI/CUI on defense contracts.",
    },
    "as9100": {
        label: "AS9100",
        blurb: "AS9100 — aerospace quality-management standard (ISO 9001 plus aviation/defense requirements). Common prerequisite on DoD aerospace work.",
    },

    // ── State / other programs ──────────────────────────────────────────────
    mbe: {
        label: "MBE",
        blurb: "Minority Business Enterprise — a state/local certification (not federal) for minority-owned firms, used for state and municipal diversity goals.",
    },
    dbe: {
        label: "DBE",
        blurb: "Disadvantaged Business Enterprise — DOT-administered program for socially & economically disadvantaged firms on federally-funded transportation projects.",
    },
    vsbe: {
        label: "VSBE",
        blurb: "Veteran Small Business Enterprise — a state-level veteran-owned business certification (varies by state).",
    },
};

/** A handful of alias spellings that should resolve to a canonical glossary key. */
const ALIASES: Record<string, string> = {
    "8aprogram": "8a",
    "8abd": "8a",
    womanownedsmallbusiness: "wosb",
    womenownedsmallbusiness: "wosb",
    servicedisabledveteranownedsmallbusiness: "sdvosb",
    veteranownedsmallbusiness: "vosb",
    smalldisadvantagedbusiness: "sdb",
    smallbusiness: "sb",
    historicallyunderutilizedbusinesszone: "hubzone",
    "iso9001": "iso9001",
    "iso90012015": "iso9001",
    "iso270012013": "iso27001",
    abilityone: "asbc",
    alaskanativecorporation: "ant",
    anc: "ant",
    minoritybusinessenterprise: "mbe",
    disadvantagedbusinessenterprise: "dbe",
};

/** Normalize a raw cert code → glossary key (lowercase, alphanumerics only). */
function normCode(code: string): string {
    return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve a raw certification code/label to its CertInfo, or null when unknown.
 * Handles formatting noise ("8(a)", "8 A", "SDVOSB.") and a few common aliases.
 */
export function certInfo(code: string | null | undefined): CertInfo | null {
    if (!code) return null;
    const key = normCode(code);
    if (!key) return null;
    if (CERT_GLOSSARY[key]) return CERT_GLOSSARY[key];
    const aliased = ALIASES[key];
    if (aliased && CERT_GLOSSARY[aliased]) return CERT_GLOSSARY[aliased];
    return null;
}
