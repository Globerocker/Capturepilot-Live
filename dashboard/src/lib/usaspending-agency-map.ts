/**
 * Maps SAM.gov-style agency strings to USAspending toptier names.
 *
 * SAM writes agency strings inconsistently:
 *   - "DEPT OF DEFENSE"
 *   - "AGRICULTURE, DEPARTMENT OF"
 *   - "VETERANS AFFAIRS, DEPARTMENT OF"
 *   - "GENERAL SERVICES ADMINISTRATION"
 *
 * USAspending /api/v2/search/spending_by_award/ expects the exact
 * toptier label. Calling with the wrong form silently returns 0
 * results — that's why compute_past_performance_stats had 318
 * federal pairs but 0 USAspending hits.
 *
 * Built from a real-world distribution scan against the
 * opportunities table on 2026-05-22.
 */

const EXACT_MAP: Record<string, string> = {
    // SAM → USAspending toptier
    "DEPT OF DEFENSE": "Department of Defense",
    "DEPARTMENT OF DEFENSE": "Department of Defense",
    "DOD": "Department of Defense",

    "AGRICULTURE, DEPARTMENT OF": "Department of Agriculture",
    "DEPT OF AGRICULTURE": "Department of Agriculture",
    "USDA": "Department of Agriculture",

    "VETERANS AFFAIRS, DEPARTMENT OF": "Department of Veterans Affairs",
    "VA": "Department of Veterans Affairs",

    "GENERAL SERVICES ADMINISTRATION": "General Services Administration",
    "GSA": "General Services Administration",

    "ENVIRONMENTAL PROTECTION AGENCY": "Environmental Protection Agency",
    "EPA": "Environmental Protection Agency",

    "INTERIOR, DEPARTMENT OF THE": "Department of the Interior",
    "DEPARTMENT OF THE INTERIOR": "Department of the Interior",
    "DOI": "Department of the Interior",

    "HEALTH AND HUMAN SERVICES, DEPARTMENT OF": "Department of Health and Human Services",
    "DEPT OF HHS": "Department of Health and Human Services",
    "HHS": "Department of Health and Human Services",

    "NATIONAL AERONAUTICS AND SPACE ADMINISTRATION": "National Aeronautics and Space Administration",
    "NASA": "National Aeronautics and Space Administration",

    "STATE, DEPARTMENT OF": "Department of State",
    "DEPARTMENT OF STATE": "Department of State",

    "JUSTICE, DEPARTMENT OF": "Department of Justice",
    "DEPT OF JUSTICE": "Department of Justice",
    "DOJ": "Department of Justice",

    "TRANSPORTATION, DEPARTMENT OF": "Department of Transportation",
    "DOT": "Department of Transportation",

    "HOMELAND SECURITY, DEPARTMENT OF": "Department of Homeland Security",
    "DHS": "Department of Homeland Security",

    "ENERGY, DEPARTMENT OF": "Department of Energy",
    "DEPT OF ENERGY": "Department of Energy",
    "DOE": "Department of Energy",

    "HOUSING AND URBAN DEVELOPMENT, DEPARTMENT OF": "Department of Housing and Urban Development",
    "HUD": "Department of Housing and Urban Development",

    "COMMERCE, DEPARTMENT OF": "Department of Commerce",
    "DOC": "Department of Commerce",

    "LABOR, DEPARTMENT OF": "Department of Labor",
    "DOL": "Department of Labor",

    "EDUCATION, DEPARTMENT OF": "Department of Education",
    "DEPT OF EDUCATION": "Department of Education",
    "ED": "Department of Education",

    "TREASURY, DEPARTMENT OF": "Department of the Treasury",
    "DEPT OF TREASURY": "Department of the Treasury",
    "DEPARTMENT OF TREASURY": "Department of the Treasury",

    "ADMINISTRATIVE OFFICE OF THE US COURTS": "Administrative Office of the United States Courts",
    "AOUSC": "Administrative Office of the United States Courts",

    "LIBRARY OF CONGRESS": "Library of Congress",
    "LOC": "Library of Congress",

    "FEDERAL DEPOSIT INSURANCE CORPORATION": "Federal Deposit Insurance Corporation",
    "FDIC": "Federal Deposit Insurance Corporation",

    "SOCIAL SECURITY ADMINISTRATION": "Social Security Administration",
    "SSA": "Social Security Administration",

    "OFFICE OF PERSONNEL MANAGEMENT": "Office of Personnel Management",
    "OPM": "Office of Personnel Management",

    "SMALL BUSINESS ADMINISTRATION": "Small Business Administration",
    "SBA": "Small Business Administration",

    "NUCLEAR REGULATORY COMMISSION": "Nuclear Regulatory Commission",
    "NRC": "Nuclear Regulatory Commission",

    "NATIONAL SCIENCE FOUNDATION": "National Science Foundation",
    "NSF": "National Science Foundation",

    "HOUSE OF REPRESENTATIVES, THE": "Legislative Branch",
    "THE LEGISLATIVE BRANCH": "Legislative Branch",
    "LEGISLATIVE BRANCH": "Legislative Branch",
    "SENATE, THE": "Legislative Branch",

    "EXECUTIVE OFFICE OF THE PRESIDENT": "Executive Office of the President",
    "EOP": "Executive Office of the President",
};

// Suffix patterns where the heuristic still applies even if the exact key
// isn't in the table (e.g. nested sub-bureau names like "AGRICULTURE, DEPT
// OF, ANIMAL AND PLANT HEALTH INSPECTION SERVICE").
const PREFIX_HEURISTICS: Array<{ pattern: RegExp; toptier: string }> = [
    { pattern: /^AGRICULTURE/i, toptier: "Department of Agriculture" },
    { pattern: /^DEFENSE|^DEPT OF DEFENSE|^DOD\b|\bARMY\b|\bNAVY\b|\bAIR FORCE\b|\bMARINE\b|\bDEFENSE LOGISTICS\b/i, toptier: "Department of Defense" },
    { pattern: /^VETERANS AFFAIRS|\bVHA\b|\bVBA\b/i, toptier: "Department of Veterans Affairs" },
    { pattern: /^GENERAL SERVICES ADMIN/i, toptier: "General Services Administration" },
    { pattern: /^ENVIRONMENTAL PROTECTION/i, toptier: "Environmental Protection Agency" },
    { pattern: /^INTERIOR\b|^DEPARTMENT OF THE INTERIOR|\bBUREAU OF LAND MANAGEMENT\b|\bNATIONAL PARK SERVICE\b/i, toptier: "Department of the Interior" },
    { pattern: /^HEALTH AND HUMAN SERVICES|\bNIH\b|\bCDC\b|\bFDA\b|\bCMS\b/i, toptier: "Department of Health and Human Services" },
    { pattern: /^NATIONAL AERONAUTICS/i, toptier: "National Aeronautics and Space Administration" },
    { pattern: /^STATE,? DEPARTMENT|^DEPARTMENT OF STATE/i, toptier: "Department of State" },
    { pattern: /^JUSTICE,? DEPARTMENT|\bFBI\b|\bDEA\b|\bATF\b|\bBOP\b/i, toptier: "Department of Justice" },
    { pattern: /^TRANSPORTATION|\bFAA\b|\bFHWA\b|\bFTA\b/i, toptier: "Department of Transportation" },
    { pattern: /^HOMELAND SECURITY|\bICE\b|\bCBP\b|\bTSA\b|\bFEMA\b|\bUSCIS\b|\bSECRET SERVICE\b/i, toptier: "Department of Homeland Security" },
    { pattern: /^ENERGY,? DEPARTMENT/i, toptier: "Department of Energy" },
    { pattern: /^HOUSING AND URBAN DEVELOPMENT/i, toptier: "Department of Housing and Urban Development" },
    { pattern: /^COMMERCE,? DEPARTMENT|\bNOAA\b|\bUSPTO\b|\bCENSUS\b/i, toptier: "Department of Commerce" },
    { pattern: /^LABOR,? DEPARTMENT|\bOSHA\b|\bBLS\b/i, toptier: "Department of Labor" },
    { pattern: /^EDUCATION,? DEPARTMENT/i, toptier: "Department of Education" },
    { pattern: /^TREASURY/i, toptier: "Department of the Treasury" },
    { pattern: /\bHOUSE OF REPRESENTATIVES\b|\bSENATE\b|^LEGISLATIVE BRANCH/i, toptier: "Legislative Branch" },
    { pattern: /^EXECUTIVE OFFICE OF THE PRESIDENT/i, toptier: "Executive Office of the President" },
];

export function toUsaSpendingToptier(samAgency: string | null | undefined): string | null {
    if (!samAgency) return null;
    const key = samAgency.trim().toUpperCase();
    if (EXACT_MAP[key]) return EXACT_MAP[key];
    for (const { pattern, toptier } of PREFIX_HEURISTICS) {
        if (pattern.test(key)) return toptier;
    }
    return null;
}
