/**
 * Deterministic contract value estimator.
 * Uses NAICS averages and set-aside caps to estimate when award_amount is missing.
 */

const NAICS_AVG_VALUES: Record<string, number> = {
    "561720": 350_000,   // Janitorial Services
    "561210": 800_000,   // Facilities Support
    "561730": 250_000,   // Landscaping
    "561710": 150_000,   // Pest Control
    "236220": 5_000_000, // Commercial Construction
    "238210": 1_200_000, // Electrical
    "238220": 1_000_000, // Plumbing/HVAC
    "541330": 2_000_000, // Engineering
    "541512": 3_000_000, // Computer Systems Design
    "541611": 1_500_000, // Management Consulting
    "561320": 500_000,   // Temporary Staffing
    "561612": 600_000,   // Security Guards
    "562111": 400_000,   // Waste Collection
    "562910": 1_500_000, // Remediation
    "541519": 2_500_000, // Other Computer Services
    "541990": 750_000,   // Other Professional Services
    "488190": 800_000,   // Support Activities for Transport
    "811310": 300_000,   // Machinery Repair
};

const SET_ASIDE_CAPS: Record<string, { min: number; max: number }> = {
    "micro": { min: 0, max: 10_000 },
    "sap": { min: 10_000, max: 250_000 },
    "8(a)": { min: 50_000, max: 4_500_000 },
    "8a": { min: 50_000, max: 4_500_000 },
    "sdvosb": { min: 50_000, max: 4_000_000 },
    "wosb": { min: 50_000, max: 4_000_000 },
    "hubzone": { min: 50_000, max: 4_000_000 },
};

export interface EstimateResult {
    estimatedValue: number;
    confidence: "low" | "medium" | "high";
    basis: string;
}

export function estimateContractValue(input: {
    naicsCode?: string | null;
    setAsideCode?: string | null;
    noticeType?: string | null;
}): EstimateResult | null {
    const { naicsCode, setAsideCode } = input;

    let value: number | null = null;
    let confidence: "low" | "medium" | "high" = "low";
    let basis = "";

    // 1. NAICS-based estimate
    if (naicsCode && NAICS_AVG_VALUES[naicsCode]) {
        value = NAICS_AVG_VALUES[naicsCode];
        confidence = "medium";
        basis = "NAICS average";
    } else if (naicsCode) {
        const prefix4 = naicsCode.substring(0, 4);
        const matches = Object.entries(NAICS_AVG_VALUES).filter(([k]) => k.startsWith(prefix4));
        if (matches.length > 0) {
            value = matches.reduce((sum, [, v]) => sum + v, 0) / matches.length;
            confidence = "low";
            basis = "NAICS category avg";
        }
    }

    // 2. Set-aside cap adjustment
    if (setAsideCode) {
        const sa = setAsideCode.toLowerCase();
        for (const [key, cap] of Object.entries(SET_ASIDE_CAPS)) {
            if (sa.includes(key)) {
                if (value && value > cap.max) {
                    value = cap.max;
                    basis += ` (${key} cap)`;
                }
                if (!value) {
                    value = (cap.min + cap.max) / 2;
                    basis = `${key} set-aside midpoint`;
                    confidence = "low";
                }
                break;
            }
        }
    }

    // 3. Fallback
    if (!value) {
        value = 500_000;
        confidence = "low";
        basis = "Federal average";
    }

    return { estimatedValue: Math.round(value), confidence, basis };
}
