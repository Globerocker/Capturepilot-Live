/**
 * Keyword-based NAICS code classifier.
 * Infers likely NAICS codes from crawled website text.
 */

import { NAICS_CODES } from "./naics-codes";

export interface NaicsInference {
    code: string;
    label: string;
    confidence: number;
    matched_keywords: string[];
}

interface KeywordEntry {
    keywords: string[];
    weight: number;
}

// Weighted keyword mapping for popular NAICS codes
const NAICS_KEYWORD_MAP: Record<string, KeywordEntry[]> = {
    "561720": [
        { keywords: ["janitorial", "janitor"], weight: 3 },
        { keywords: ["cleaning", "clean", "cleaner"], weight: 2 },
        { keywords: ["custodial", "custodian"], weight: 3 },
        { keywords: ["floor care", "floor maintenance", "floor cleaning"], weight: 2 },
        { keywords: ["sanitation", "sanitize", "sanitizing"], weight: 2 },
        { keywords: ["housekeeping"], weight: 3 },
        { keywords: ["window cleaning", "window washing"], weight: 2 },
        { keywords: ["pressure washing", "power washing"], weight: 2 },
        { keywords: ["carpet cleaning"], weight: 2 },
        { keywords: ["disinfection", "disinfecting"], weight: 2 },
    ],
    "561210": [
        { keywords: ["facilities support", "facility support"], weight: 3 },
        { keywords: ["facility management", "facilities management"], weight: 3 },
        { keywords: ["building maintenance", "building management"], weight: 2 },
        { keywords: ["property management"], weight: 2 },
        { keywords: ["maintenance services"], weight: 2 },
        { keywords: ["grounds maintenance"], weight: 2 },
    ],
    "561730": [
        { keywords: ["landscaping", "landscape"], weight: 3 },
        { keywords: ["lawn care", "lawn maintenance"], weight: 3 },
        { keywords: ["grounds maintenance", "groundskeeping"], weight: 3 },
        { keywords: ["tree service", "tree trimming", "tree removal"], weight: 2 },
        { keywords: ["irrigation"], weight: 2 },
        { keywords: ["mowing", "turf management"], weight: 2 },
        { keywords: ["snow removal", "snow plowing"], weight: 2 },
    ],
    "236220": [
        { keywords: ["commercial construction", "commercial building"], weight: 3 },
        { keywords: ["general contractor", "general contracting"], weight: 3 },
        { keywords: ["construction management"], weight: 2 },
        { keywords: ["design-build"], weight: 2 },
        { keywords: ["renovation", "remodel", "remodeling"], weight: 2 },
        { keywords: ["tenant improvement"], weight: 2 },
    ],
    "238210": [
        { keywords: ["electrical contractor", "electrical contracting"], weight: 3 },
        { keywords: ["electrician", "electrical work"], weight: 3 },
        { keywords: ["wiring", "electrical wiring"], weight: 2 },
        { keywords: ["panel", "electrical panel"], weight: 2 },
        { keywords: ["lighting installation", "lighting systems"], weight: 2 },
        { keywords: ["power distribution"], weight: 2 },
    ],
    "238220": [
        { keywords: ["plumbing", "plumber"], weight: 3 },
        { keywords: ["hvac", "heating ventilation", "air conditioning"], weight: 3 },
        { keywords: ["mechanical contractor"], weight: 3 },
        { keywords: ["piping", "pipe fitting"], weight: 2 },
        { keywords: ["boiler"], weight: 2 },
    ],
    "541512": [
        { keywords: ["software development", "software engineering"], weight: 3 },
        { keywords: ["computer systems design", "systems design"], weight: 3 },
        { keywords: ["it services", "information technology"], weight: 2 },
        { keywords: ["cybersecurity", "cyber security", "infosec"], weight: 2 },
        { keywords: ["cloud computing", "cloud services"], weight: 2 },
        { keywords: ["systems integration", "system integration"], weight: 2 },
        { keywords: ["devops", "development operations"], weight: 2 },
        { keywords: ["web development", "application development"], weight: 2 },
        { keywords: ["data analytics", "data science"], weight: 2 },
        { keywords: ["managed services", "managed it"], weight: 2 },
    ],
    "541330": [
        { keywords: ["engineering services", "engineering firm"], weight: 3 },
        { keywords: ["civil engineering", "structural engineering"], weight: 3 },
        { keywords: ["mechanical engineering", "electrical engineering"], weight: 2 },
        { keywords: ["environmental engineering"], weight: 2 },
        { keywords: ["architectural engineering"], weight: 2 },
        { keywords: ["project engineering"], weight: 2 },
    ],
    "541611": [
        { keywords: ["management consulting", "business consulting"], weight: 3 },
        { keywords: ["administrative consulting", "organizational consulting"], weight: 3 },
        { keywords: ["strategic planning"], weight: 2 },
        { keywords: ["process improvement"], weight: 2 },
        { keywords: ["change management"], weight: 2 },
        { keywords: ["program management"], weight: 2 },
    ],
    "541690": [
        { keywords: ["scientific consulting", "technical consulting"], weight: 3 },
        { keywords: ["environmental consulting"], weight: 3 },
        { keywords: ["research and development"], weight: 2 },
        { keywords: ["laboratory", "testing services"], weight: 2 },
    ],
    "561320": [
        { keywords: ["staffing", "staffing agency", "staffing services"], weight: 3 },
        { keywords: ["temporary staffing", "temp agency"], weight: 3 },
        { keywords: ["workforce solutions", "talent acquisition"], weight: 2 },
        { keywords: ["recruitment", "recruiting"], weight: 2 },
        { keywords: ["contract staffing"], weight: 2 },
    ],
    "561612": [
        { keywords: ["security guard", "security guards"], weight: 3 },
        { keywords: ["security patrol", "security services"], weight: 3 },
        { keywords: ["armed security", "unarmed security"], weight: 3 },
        { keywords: ["physical security"], weight: 2 },
        { keywords: ["access control"], weight: 2 },
        { keywords: ["guard services", "protective services"], weight: 2 },
    ],
    "561710": [
        { keywords: ["pest control", "exterminating"], weight: 3 },
        { keywords: ["termite", "rodent control"], weight: 3 },
        { keywords: ["fumigation"], weight: 2 },
        { keywords: ["integrated pest management", "ipm"], weight: 2 },
    ],
    "562111": [
        { keywords: ["waste collection", "waste management"], weight: 3 },
        { keywords: ["solid waste", "trash collection"], weight: 3 },
        { keywords: ["garbage collection", "refuse"], weight: 2 },
        { keywords: ["recycling services"], weight: 2 },
        { keywords: ["dumpster", "waste hauling"], weight: 2 },
    ],
    "562910": [
        { keywords: ["remediation", "environmental remediation"], weight: 3 },
        { keywords: ["hazardous waste", "hazmat"], weight: 3 },
        { keywords: ["asbestos abatement", "lead abatement"], weight: 3 },
        { keywords: ["site cleanup", "contamination"], weight: 2 },
        { keywords: ["environmental cleanup"], weight: 2 },
    ],
    "484110": [
        { keywords: ["freight trucking", "trucking company"], weight: 3 },
        { keywords: ["local freight", "local trucking"], weight: 3 },
        { keywords: ["delivery services", "hauling"], weight: 2 },
        { keywords: ["transportation", "logistics"], weight: 2 },
    ],
    "493110": [
        { keywords: ["warehousing", "warehouse"], weight: 3 },
        { keywords: ["storage facility", "storage services"], weight: 3 },
        { keywords: ["distribution center", "fulfillment"], weight: 2 },
        { keywords: ["inventory management"], weight: 2 },
    ],
    "811310": [
        { keywords: ["machinery repair", "equipment repair"], weight: 3 },
        { keywords: ["commercial repair", "industrial repair"], weight: 3 },
        { keywords: ["preventive maintenance"], weight: 2 },
        { keywords: ["equipment maintenance", "machine maintenance"], weight: 2 },
    ],
    "238320": [
        { keywords: ["painting contractor", "painting services"], weight: 3 },
        { keywords: ["wall covering", "wallpaper"], weight: 3 },
        { keywords: ["interior painting", "exterior painting"], weight: 2 },
        { keywords: ["industrial painting", "coating"], weight: 2 },
    ],
    "238160": [
        { keywords: ["roofing contractor", "roofing services"], weight: 3 },
        { keywords: ["roof repair", "roof replacement"], weight: 3 },
        { keywords: ["commercial roofing", "industrial roofing"], weight: 2 },
        { keywords: ["roof maintenance"], weight: 2 },
    ],
    "237310": [
        { keywords: ["highway construction", "road construction"], weight: 3 },
        { keywords: ["bridge construction"], weight: 3 },
        { keywords: ["street construction", "paving"], weight: 2 },
        { keywords: ["asphalt", "concrete paving"], weight: 2 },
    ],
    "541511": [
        { keywords: ["custom programming", "custom software"], weight: 3 },
        { keywords: ["application programming", "coding services"], weight: 3 },
        { keywords: ["software programming"], weight: 2 },
    ],
    "541519": [
        { keywords: ["computer services", "it support"], weight: 3 },
        { keywords: ["help desk", "technical support"], weight: 3 },
        { keywords: ["network administration", "system administration"], weight: 2 },
    ],
    "541614": [
        { keywords: ["process design", "logistics consulting"], weight: 3 },
        { keywords: ["supply chain management", "supply chain consulting"], weight: 3 },
        { keywords: ["operations consulting"], weight: 2 },
    ],
    "541620": [
        { keywords: ["environmental consulting"], weight: 3 },
        { keywords: ["environmental assessment", "environmental impact"], weight: 3 },
        { keywords: ["compliance consulting", "regulatory consulting"], weight: 2 },
    ],
};

export function classifyNaics(
    description: string,
    services: string[],
    pageContent: string,
    existingSamNaics?: string[]
): NaicsInference[] {
    // Combine all text and lowercase
    const allText = [description, ...services, pageContent].join(" ").toLowerCase();

    const results: NaicsInference[] = [];

    // If SAM.gov NAICS provided, include at confidence 1.0
    if (existingSamNaics?.length) {
        for (const code of existingSamNaics) {
            const naicsInfo = NAICS_CODES.find(n => n.code === code);
            if (naicsInfo) {
                results.push({
                    code,
                    label: naicsInfo.label,
                    confidence: 1.0,
                    matched_keywords: ["SAM.gov registration"],
                });
            }
        }
    }

    // Score each NAICS code by keyword matching
    for (const [code, entries] of Object.entries(NAICS_KEYWORD_MAP)) {
        // Skip if already added from SAM
        if (results.some(r => r.code === code)) continue;

        let totalWeight = 0;
        let maxWeight = 0;
        const matchedKeywords: string[] = [];

        for (const entry of entries) {
            maxWeight += entry.weight;
            for (const keyword of entry.keywords) {
                if (allText.includes(keyword)) {
                    totalWeight += entry.weight;
                    matchedKeywords.push(keyword);
                    break; // count each entry only once
                }
            }
        }

        if (totalWeight > 0) {
            const confidence = Math.min(totalWeight / maxWeight, 1.0);
            const naicsInfo = NAICS_CODES.find(n => n.code === code);
            results.push({
                code,
                label: naicsInfo?.label || code,
                confidence: Math.round(confidence * 100) / 100,
                matched_keywords: matchedKeywords,
            });
        }
    }

    // Sort by confidence, return top 5
    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, 5);
}
