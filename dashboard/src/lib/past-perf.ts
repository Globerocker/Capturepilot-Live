/**
 * CPARS-proxy past-performance rating.
 *
 * Real CPARS/PPIRS data is not public, but we can synthesize a defensible
 * proxy rating from public signals in FPDS / USASpending / GAO:
 *
 *   Exceptional    (≥0.85)  — many contracts, many extensions, low protests, high repeat
 *   Very Good      (0.70-0.85) — solid volume, healthy mod ratio, few protests
 *   Satisfactory   (0.50-0.70) — average across signals
 *   Marginal       (0.30-0.50) — thin volume or termination/protest flags
 *   Unsatisfactory (<0.30)  — heavy terminations or sustained protests
 *   Insufficient Data       — <3 contracts or no PoP information
 *
 * Inputs required:
 *   total_contracts             — count of awards (FPDS / USASpending)
 *   completed_contracts         — awards with closed PoP
 *   modification_count          — total modifications across all awards
 *   extension_ratio             — option-exercises / completed (0..1 typical)
 *   termination_count           — terminations for default or convenience
 *   protest_against_count       — GAO protests filed AGAINST this UEI
 *   protest_filed_count         — GAO protests this UEI has filed (neutral)
 *   repeat_customer_ratio       — % of awards from top-3 agencies
 */

export interface PastPerfInputs {
    total_contracts: number;
    completed_contracts: number;
    modification_count: number;
    extension_ratio: number;
    termination_count: number;
    protest_against_count: number;
    protest_filed_count: number;
    repeat_customer_ratio: number;
}

export interface PastPerfResult {
    rating:
        | "exceptional"
        | "very_good"
        | "satisfactory"
        | "marginal"
        | "unsatisfactory"
        | "insufficient_data";
    rating_score: number;
    reasoning: string;
}

export function computePastPerf(inputs: PastPerfInputs): PastPerfResult {
    const {
        total_contracts,
        completed_contracts,
        modification_count,
        extension_ratio,
        termination_count,
        protest_against_count,
        repeat_customer_ratio,
    } = inputs;

    if (total_contracts < 3) {
        return {
            rating: "insufficient_data",
            rating_score: 0,
            reasoning: `Only ${total_contracts} total contracts on record — below the 3-contract minimum for a meaningful rating.`,
        };
    }

    const reasons: string[] = [];
    let score = 0.5; // baseline "satisfactory"

    // Volume boost (more awards = more opportunity to demonstrate performance)
    if (total_contracts >= 50) { score += 0.15; reasons.push(`${total_contracts} contracts demonstrate sustained delivery`); }
    else if (total_contracts >= 20) { score += 0.1; reasons.push(`${total_contracts} contracts — solid volume`); }
    else if (total_contracts >= 10) { score += 0.05; reasons.push(`${total_contracts} contracts — moderate volume`); }

    // Extension ratio — exercising options = customer satisfaction
    if (extension_ratio >= 0.6) { score += 0.15; reasons.push(`${Math.round(extension_ratio * 100)}% option-exercise rate — customers keep coming back`); }
    else if (extension_ratio >= 0.4) { score += 0.08; reasons.push(`${Math.round(extension_ratio * 100)}% extension ratio`); }
    else if (extension_ratio < 0.2 && completed_contracts >= 5) { score -= 0.05; reasons.push(`Only ${Math.round(extension_ratio * 100)}% extensions — below-average customer retention`); }

    // Modifications are a mixed signal — 0 mods is robotic, 20+ is unstable
    const modRatio = total_contracts > 0 ? modification_count / total_contracts : 0;
    if (modRatio > 10) { score -= 0.05; reasons.push(`${modRatio.toFixed(1)} mods/contract — high change rate`); }

    // Terminations are a strong negative signal
    if (termination_count > 0) {
        const termRatio = termination_count / total_contracts;
        if (termRatio >= 0.1) { score -= 0.3; reasons.push(`${termination_count} terminations (${Math.round(termRatio * 100)}% of contracts) — major concern`); }
        else { score -= 0.15; reasons.push(`${termination_count} termination(s) on record`); }
    }

    // Protests against them — agencies sustain protests when a contractor
    // misrepresents. High protest count is a negative.
    if (protest_against_count >= 5) { score -= 0.1; reasons.push(`${protest_against_count} GAO protests filed against — above typical`); }
    else if (protest_against_count >= 2) { score -= 0.05; reasons.push(`${protest_against_count} GAO protests against`); }

    // Repeat customer ratio — high = they keep coming back
    if (repeat_customer_ratio >= 0.7) { score += 0.1; reasons.push(`${Math.round(repeat_customer_ratio * 100)}% of work with top 3 agencies — strong relationships`); }

    score = Math.max(0, Math.min(1, score));

    let rating: PastPerfResult["rating"];
    if (score >= 0.85) rating = "exceptional";
    else if (score >= 0.7) rating = "very_good";
    else if (score >= 0.5) rating = "satisfactory";
    else if (score >= 0.3) rating = "marginal";
    else rating = "unsatisfactory";

    return {
        rating,
        rating_score: Math.round(score * 1000) / 1000,
        reasoning: reasons.length > 0 ? reasons.join(". ") + "." : "Synthesized from available FPDS / USASpending signals.",
    };
}
