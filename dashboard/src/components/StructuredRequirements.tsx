"use client";

import { useState, useEffect } from "react";
import { Briefcase, Loader2 } from "lucide-react";

interface Requirements {
    min_workforce?: string;
    years_experience?: string;
    bonding_req?: string;
    performance_period?: string;
    equipment_req?: string;
    certifications?: string;
    eval_criteria_summary?: string;
    clearance_level?: string;
    insurance_req?: string;
}

interface Props {
    dbRequirements: Requirements;
    noticeId: string;
}

// Client-side lightweight extraction from description text
function extractRequirements(html: string): Requirements {
    // Strip HTML tags for text analysis
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const lower = text.toLowerCase();
    const reqs: Requirements = {};

    // Workforce / employees
    const workforceMatch = lower.match(/(\d+)\s*(?:employee|worker|personnel|staff|fte)/);
    if (workforceMatch) reqs.min_workforce = workforceMatch[1];

    // Years of experience
    const yearsMatch = lower.match(/(\d+)\s*(?:year|yr)s?\s*(?:of\s+)?(?:experience|exp\.?|relevant)/);
    if (yearsMatch) reqs.years_experience = yearsMatch[1];

    // Bonding
    if (/\bbond(?:ing|ed)?\b/i.test(text)) {
        const bondAmount = lower.match(/bond(?:ing|ed)?[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)/);
        reqs.bonding_req = bondAmount ? `$${bondAmount[1]}` : "Required";
    }

    // Insurance
    if (/\binsurance\b|\bliability\b/i.test(text)) {
        const insMatch = lower.match(/(?:insurance|liability)[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)/);
        reqs.insurance_req = insMatch ? `$${insMatch[1]}` : "Required";
    }

    // Performance period
    const periodMatch = lower.match(
        /(?:period\s+of\s+performance|base\s+(?:year|period)|contract\s+(?:period|duration))[^.]*?(\d+)\s*(year|month|day|week)/i
    );
    if (periodMatch) {
        reqs.performance_period = `${periodMatch[1]} ${periodMatch[2]}${parseInt(periodMatch[1]) > 1 ? "s" : ""}`;
    }
    if (!reqs.performance_period) {
        const altPeriod = lower.match(/(\d+)\s*(?:base|option)\s*year/);
        if (altPeriod) reqs.performance_period = `${altPeriod[1]} year base`;
    }

    // Equipment
    const equipKeywords = [
        "fleet", "truck", "vehicle", "excavator", "bulldozer", "crane", "forklift",
        "mower", "tractor", "backhoe", "loader", "paving", "chipper", "aerial lift",
        "pressure washer", "buffer", "floor machine", "vacuum", "carpet cleaner"
    ];
    const foundEquip = equipKeywords.filter(kw => lower.includes(kw));
    if (foundEquip.length > 0) {
        reqs.equipment_req = foundEquip.map(e => e.charAt(0).toUpperCase() + e.slice(1)).join(", ");
    }

    // Security clearance
    if (/\btop\s+secret\b|\bts[/ ]sci\b/i.test(text)) reqs.clearance_level = "Top Secret";
    else if (/\bsecret\b(?!\s*(?:service|ary|ion))/i.test(text)) reqs.clearance_level = "Secret";
    else if (/\bbackground\s+(?:check|investigation)\b|\bsuitability\b/i.test(text)) reqs.clearance_level = "Background Check";

    // Certifications
    const certPatterns = [
        { pattern: /\biso\s*\d{4,5}/i, label: "ISO" },
        { pattern: /\bcmmi/i, label: "CMMI" },
        { pattern: /\bosha/i, label: "OSHA" },
        { pattern: /\bsba\b/i, label: "SBA" },
        { pattern: /\bleed\b/i, label: "LEED" },
        { pattern: /\basa[sp]e\b/i, label: "ASSE" },
    ];
    const foundCerts = certPatterns.filter(c => c.pattern.test(text)).map(c => c.label);
    if (foundCerts.length > 0) reqs.certifications = foundCerts.join(", ");

    // Evaluation criteria
    const evalSection = text.match(/evaluation\s+(?:criteria|factor)[^]*?(?=\n\n|\.$|<)/i);
    if (evalSection) {
        const snippet = evalSection[0].slice(0, 300).trim();
        reqs.eval_criteria_summary = snippet + (evalSection[0].length > 300 ? "..." : "");
    }

    return reqs;
}

export default function StructuredRequirements({ dbRequirements, noticeId }: Props) {
    const [extracted, setExtracted] = useState<Requirements>({});
    const [loading, setLoading] = useState(false);

    // Check if DB requirements are essentially empty
    const dbEmpty = !dbRequirements.min_workforce && !dbRequirements.years_experience &&
        !dbRequirements.bonding_req && !dbRequirements.performance_period &&
        !dbRequirements.equipment_req && !dbRequirements.certifications &&
        !dbRequirements.eval_criteria_summary;

    useEffect(() => {
        if (!dbEmpty || !noticeId) return;

        const fetchAndExtract = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/sam/description?noticeId=${encodeURIComponent(noticeId)}`);
                const data = await res.json();
                if (res.ok && data.description) {
                    const reqs = extractRequirements(data.description);
                    setExtracted(reqs);
                }
            } catch { /* ignore */ }
            setLoading(false);
        };

        fetchAndExtract();
    }, [dbEmpty, noticeId]);

    const reqs = dbEmpty ? extracted : dbRequirements;
    const isExtracted = dbEmpty && Object.keys(extracted).length > 0;

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
                <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                    <Briefcase className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Structured Requirements
                </h2>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
                {isExtracted && (
                    <span className="text-[10px] font-typewriter text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Auto-Extracted
                    </span>
                )}
            </div>

            <div className="p-4 sm:p-8">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
                    <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Min Workforce</p>
                        <p className="font-bold text-stone-800 text-lg">{reqs.min_workforce ? `${reqs.min_workforce}+` : "Not Spec."}</p>
                    </div>
                    <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Years Experience</p>
                        <p className="font-bold text-stone-800 text-lg">{reqs.years_experience ? `${reqs.years_experience} Years` : "Not Spec."}</p>
                    </div>
                    <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Bonding</p>
                        <p className="font-bold text-stone-800 text-lg">{reqs.bonding_req || "Not Spec."}</p>
                    </div>
                    <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Performance Period</p>
                        <p className="font-bold text-stone-800">{reqs.performance_period || "Not Spec."}</p>
                    </div>
                    {(reqs.clearance_level || reqs.insurance_req) && (
                        <>
                            {reqs.clearance_level && (
                                <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Security Clearance</p>
                                    <p className="font-bold text-stone-800">{reqs.clearance_level}</p>
                                </div>
                            )}
                            {reqs.insurance_req && (
                                <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Insurance</p>
                                    <p className="font-bold text-stone-800">{reqs.insurance_req}</p>
                                </div>
                            )}
                        </>
                    )}
                    <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100 md:col-span-2">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Equipment Required</p>
                        <p className="font-medium text-stone-800 text-sm line-clamp-2">{reqs.equipment_req || "None specified."}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Required Certifications</p>
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-blue-900 text-sm">
                            {reqs.certifications || "None specified in notice."}
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Evaluation Criteria Summary</p>
                        <div className="prose prose-sm prose-stone max-w-none text-stone-700">
                            {reqs.eval_criteria_summary ? (
                                <p>{reqs.eval_criteria_summary}</p>
                            ) : (
                                <p className="italic text-stone-500">
                                    {dbEmpty ? "Evaluation criteria not found in notice description. Check attachments for detailed criteria." : "Evaluation criteria has not yet been extracted."}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
