/**
 * Certification Recommendation Engine.
 * Analyzes which SBA certifications a company is missing and how many
 * additional opportunities each cert would unlock.
 */

import type { OpportunityForScoring } from "./match-scoring";

export interface CertRecommendation {
    cert: string;
    cert_label: string;
    unlocked_count: number;
    estimated_value: number;
    sample_opps: { title: string; agency: string; set_aside_code: string }[];
    difficulty: "easy" | "moderate" | "complex";
    timeline: string;
}

// Map set-aside codes on opportunities to the SBA certification required
const SET_ASIDE_CERT_MAP: Record<string, string> = {
    "8A": "8(a)",
    "8AN": "8(a)",
    "HZC": "HUBZone",
    "HZS": "HUBZone",
    "SDVOSBC": "SDVOSB",
    "SDVOSBS": "SDVOSB",
    "WOSB": "WOSB",
    "WOSBSS": "WOSB",
    "EDWOSB": "EDWOSB",
    "VSA": "VOSB",
};

const CERT_METADATA: Record<string, { label: string; difficulty: "easy" | "moderate" | "complex"; timeline: string }> = {
    "8(a)": { label: "8(a) Business Development", difficulty: "complex", timeline: "6-12 months" },
    "HUBZone": { label: "HUBZone Certified", difficulty: "moderate", timeline: "3-6 months" },
    "SDVOSB": { label: "Service-Disabled Veteran-Owned SB", difficulty: "moderate", timeline: "2-4 months" },
    "WOSB": { label: "Women-Owned Small Business", difficulty: "easy", timeline: "1-3 months" },
    "EDWOSB": { label: "Economically Disadvantaged WOSB", difficulty: "moderate", timeline: "2-4 months" },
    "VOSB": { label: "Veteran-Owned Small Business", difficulty: "easy", timeline: "1-3 months" },
    "SDB": { label: "Small Disadvantaged Business", difficulty: "moderate", timeline: "3-6 months" },
};

interface OppWithDetails extends OpportunityForScoring {
    title?: string;
}

/**
 * Generate certification recommendations by analyzing which missing certs
 * would unlock the most opportunities for the given NAICS profile.
 */
export function generateCertRecommendations(
    userCerts: string[],
    allOpps: (OpportunityForScoring & { title?: string })[],
    userNaics: string[],
): CertRecommendation[] {
    const userCertsLower = (userCerts || []).map(c => c.toLowerCase());
    const userNaics4 = (userNaics || []).map(n => n.substring(0, 4));

    // Group opps by the cert their set-aside requires
    const certBuckets: Record<string, OppWithDetails[]> = {};

    for (const opp of allOpps) {
        if (!opp.set_aside_code) continue;
        const code = opp.set_aside_code.toUpperCase();
        const requiredCert = SET_ASIDE_CERT_MAP[code];
        if (!requiredCert) continue;

        // Only count opps that match user's NAICS at 4-digit prefix level
        if (opp.naics_code && userNaics4.length > 0) {
            const oppNaics4 = opp.naics_code.substring(0, 4);
            if (!userNaics4.includes(oppNaics4)) continue;
        }

        if (!certBuckets[requiredCert]) certBuckets[requiredCert] = [];
        certBuckets[requiredCert].push(opp);
    }

    const recommendations: CertRecommendation[] = [];

    for (const [cert, opps] of Object.entries(certBuckets)) {
        // Skip certs the user already has
        if (userCertsLower.some(c =>
            c.includes(cert.toLowerCase()) || cert.toLowerCase().includes(c)
        )) continue;

        const meta = CERT_METADATA[cert];
        if (!meta) continue;

        const totalValue = opps.reduce((sum, o) => sum + (o.award_amount || 0), 0);
        const sampleOpps = opps
            .filter(o => o.title || o.agency)
            .slice(0, 3)
            .map(o => ({
                title: (o as OppWithDetails).title || "Government Opportunity",
                agency: o.agency || "Federal Agency",
                set_aside_code: o.set_aside_code || "",
            }));

        recommendations.push({
            cert,
            cert_label: meta.label,
            unlocked_count: opps.length,
            estimated_value: totalValue,
            sample_opps: sampleOpps,
            difficulty: meta.difficulty,
            timeline: meta.timeline,
        });
    }

    // Sort by unlocked count descending, take top 5
    recommendations.sort((a, b) => b.unlocked_count - a.unlocked_count);
    return recommendations.slice(0, 5);
}
