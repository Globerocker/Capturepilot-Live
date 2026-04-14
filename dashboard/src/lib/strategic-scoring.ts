/**
 * Strategic Scoring — deterministic, rule-based producer of the `strategic_scoring`
 * JSONB blob on opportunities. The opportunity detail UI reads three fields:
 *   - est_competition_level  ("LOW" | "MEDIUM" | "HIGH")
 *   - complexity_level       ("LOW" | "MEDIUM" | "HIGH")
 *   - win_prob_tier          ("LOW" | "MEDIUM" | "HIGH")
 *
 * This file is also used by:
 *   - /api/cron/strategic_scoring  (nightly bulk scoring)
 *   - /api/admin/enrich-opportunity/[id]  (single-opp on-demand)
 *   - /api/admin/backfill-enrichment  (bulk backfill)
 */

// High-competition NAICS codes (>500 competitors typical). Source: masterguide.
const HIGH_COMPETITION_NAICS = new Set([
    "541330", // Engineering services
    "541511", // Custom computer programming
    "541512", // Computer systems design
    "541519", // Other computer services
    "541611", // Admin management consulting
    "561210", // Facilities support services
    "561720", // Janitorial (very crowded)
    "238910", // Site prep
    "238220", // Plumbing HVAC
    "238290", // Other building equipment
]);

// Low-competition niches
const LOW_COMPETITION_NAICS = new Set([
    "334511", // Search/detection/navigation instruments
    "334290", // Other communications equipment
    "336413", // Aircraft parts
    "336992", // Military armored vehicles
    "333995", // Fluid power pumps
    "541715", // R&D physical/engineering
    "541713", // R&D nanotechnology
]);

const SET_ASIDE_RESTRICTIVE = new Set([
    "8A", "8AN", "HZC", "HZS", "SDVOSBC", "SDVOSBS", "WOSB", "WOSBSS", "EDWOSB", "VSA",
]);

type OppLite = {
    notice_type?: string | null;
    set_aside_code?: string | null;
    naics_code?: string | null;
    estimated_value?: number | null;
    award_amount?: number | null;
    description?: string | null;
    incumbent_contractor_name?: string | null;
    response_deadline?: string | null;
    sources_sought_flag?: boolean | null;
};

export interface StrategicScoring {
    est_competition_level: "LOW" | "MEDIUM" | "HIGH";
    complexity_level: "LOW" | "MEDIUM" | "HIGH";
    win_prob_tier: "LOW" | "MEDIUM" | "HIGH";
    signals: {
        has_restrictive_set_aside: boolean;
        has_incumbent: boolean;
        is_sources_sought: boolean;
        value_bucket: "micro" | "sap" | "mid" | "large" | "unknown";
        description_length: number;
        high_competition_naics: boolean;
        low_competition_naics: boolean;
    };
    computed_at: string;
    version: number;
}

export function computeStrategicScoring(opp: OppLite): StrategicScoring {
    const setAside = (opp.set_aside_code || "").toUpperCase().trim();
    const naics = (opp.naics_code || "").trim();
    const desc = opp.description || "";
    const hasIncumbent = !!opp.incumbent_contractor_name;
    const isSourcesSought =
        !!opp.sources_sought_flag
        || /sources sought|rfi|market research/i.test(opp.notice_type || "");

    const val = Number(opp.estimated_value || opp.award_amount || 0);
    const valueBucket: StrategicScoring["signals"]["value_bucket"] =
        val === 0 ? "unknown" :
            val < 10_000 ? "micro" :
                val < 250_000 ? "sap" :
                    val < 5_000_000 ? "mid" : "large";

    const hasRestrictiveSA = SET_ASIDE_RESTRICTIVE.has(setAside.replace(/\s/g, ""))
        || /8\(a\)|hubzone|sdvosb|wosb|edwosb|service.disabled|veteran/i.test(setAside);

    const highCompNaics = HIGH_COMPETITION_NAICS.has(naics);
    const lowCompNaics = LOW_COMPETITION_NAICS.has(naics);

    // --- Competition level ---
    let compScore = 0;
    if (hasRestrictiveSA) compScore -= 2;
    if (lowCompNaics) compScore -= 2;
    if (highCompNaics) compScore += 2;
    if (valueBucket === "micro" || valueBucket === "sap") compScore -= 1; // fewer firms chase small dollars
    if (valueBucket === "large") compScore += 1;
    if (isSourcesSought) compScore -= 1; // RFIs less crowded than final RFPs
    if (hasIncumbent) compScore -= 1;    // incumbents scare off weak bidders

    const est_competition_level: StrategicScoring["est_competition_level"] =
        compScore <= -2 ? "LOW" :
            compScore >= 2 ? "HIGH" : "MEDIUM";

    // --- Complexity level ---
    // Based on description length, equipment/certs in text, and value bucket.
    const descLen = desc.length;
    let complexityScore = 0;
    if (descLen > 10_000) complexityScore += 2;
    else if (descLen > 3_000) complexityScore += 1;
    else if (descLen > 500) complexityScore += 0;
    else complexityScore -= 1;
    if (/clearance|top.?secret|ts\/sci/i.test(desc)) complexityScore += 2;
    if (/iso\s*\d+|cmmi|nist|fedramp/i.test(desc)) complexityScore += 1;
    if (valueBucket === "large") complexityScore += 1;
    if (valueBucket === "micro") complexityScore -= 1;

    const complexity_level: StrategicScoring["complexity_level"] =
        complexityScore >= 3 ? "HIGH" :
            complexityScore <= 0 ? "LOW" : "MEDIUM";

    // --- Win probability tier ---
    let winScore = 0;
    if (hasRestrictiveSA) winScore += 2;
    if (isSourcesSought) winScore += 2;
    if (!hasIncumbent) winScore += 1;
    if (est_competition_level === "LOW") winScore += 2;
    else if (est_competition_level === "HIGH") winScore -= 1;
    if (complexity_level === "LOW") winScore += 1;
    else if (complexity_level === "HIGH") winScore -= 1;
    if (valueBucket === "sap" || valueBucket === "micro") winScore += 1;

    const win_prob_tier: StrategicScoring["win_prob_tier"] =
        winScore >= 4 ? "HIGH" :
            winScore <= 1 ? "LOW" : "MEDIUM";

    return {
        est_competition_level,
        complexity_level,
        win_prob_tier,
        signals: {
            has_restrictive_set_aside: hasRestrictiveSA,
            has_incumbent: hasIncumbent,
            is_sources_sought: isSourcesSought,
            value_bucket: valueBucket,
            description_length: descLen,
            high_competition_naics: highCompNaics,
            low_competition_naics: lowCompNaics,
        },
        computed_at: new Date().toISOString(),
        version: 1,
    };
}
