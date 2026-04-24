"use client";

import { useState, useEffect } from "react";
import { Briefcase, Loader2, ListChecks, Award, Package, FileText } from "lucide-react";

// Producers in the DB write 3 different key spellings for the same fields.
// This component accepts all of them via a fallback chain and normalizes once.
type RawReqs = Record<string, unknown>;

interface Props {
    dbRequirements: RawReqs | null | undefined;
    noticeId: string;
}

function pick(r: RawReqs, keys: string[]): unknown {
    for (const k of keys) {
        const v = r[k];
        if (v !== undefined && v !== null && v !== "" && v !== "Not Spec." && v !== "Not Spec") return v;
    }
    return undefined;
}

function boolish(v: unknown): string | undefined {
    if (v === true) return "Required";
    if (v === false) return undefined;
    if (typeof v === "string" && v.length > 0 && v !== "Not Spec." && v !== "Not Spec") return v;
    if (typeof v === "number") return String(v);
    return undefined;
}

function listish(v: unknown): string[] | undefined {
    if (Array.isArray(v) && v.length > 0) return v.map(String).filter(Boolean);
    if (typeof v === "string" && v.length > 0 && v !== "Not Spec." && v !== "Not Spec") return [v];
    return undefined;
}

interface Normalized {
    min_workforce?: string;
    years_experience?: string;
    bonding?: string;
    insurance?: string;
    performance_period?: string;
    place_of_performance?: string;
    clearance_level?: string;
    equipment?: string;
    certifications?: string[];
    scope_of_work?: string[];
    qualifications?: string[];
    deliverables?: string[];
    far_clauses?: string[];
    eval_criteria?: string;
}

function normalize(r: RawReqs | null | undefined): Normalized {
    if (!r || typeof r !== "object") return {};
    const out: Normalized = {};

    const minWf = pick(r, ["min_workforce", "minimum_workforce"]);
    if (typeof minWf === "number" || typeof minWf === "string") out.min_workforce = String(minWf);

    const yrs = pick(r, ["min_experience_years", "years_experience", "experience_years"]);
    if (typeof yrs === "number" || typeof yrs === "string") out.years_experience = String(yrs);

    out.bonding = boolish(pick(r, ["bonding", "bonding_req", "bonding_required"]));
    out.insurance = boolish(pick(r, ["insurance", "insurance_req", "insurance_required"]));

    const period = pick(r, ["performance_period", "period_of_performance"]);
    if (typeof period === "string") out.performance_period = period;

    const place = pick(r, ["place_of_performance"]);
    if (typeof place === "string") out.place_of_performance = place;

    const clear = pick(r, ["clearance_level", "security_clearance"]);
    if (typeof clear === "string" && clear.toLowerCase() !== "none") out.clearance_level = clear;

    out.equipment = boolish(pick(r, ["equipment", "equipment_req", "equipment_required"]));

    out.certifications = listish(pick(r, ["certifications_required", "certifications"]));
    out.scope_of_work = listish(pick(r, ["scope_of_work"]));
    out.qualifications = listish(pick(r, ["qualifications"]));
    out.deliverables = listish(pick(r, ["deliverables"]));
    out.far_clauses = listish(pick(r, ["far_clauses"]));

    const evalC = pick(r, ["eval_criteria_summary", "evaluation_criteria"]);
    if (typeof evalC === "string") out.eval_criteria = evalC;

    return out;
}

// Fallback: client-side regex extraction if the DB row is entirely empty.
function extractFromText(html: string): Normalized {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const lower = text.toLowerCase();
    const reqs: Normalized = {};

    const wf = lower.match(/(\d+)\s*(?:employee|worker|personnel|staff|fte)/);
    if (wf) reqs.min_workforce = wf[1];

    const yr = lower.match(/(\d+)\s*(?:year|yr)s?\s*(?:of\s+)?(?:experience|exp\.?)/);
    if (yr) reqs.years_experience = yr[1];

    if (/\bbond(?:ing|ed)?\b/i.test(text)) {
        const amt = lower.match(/bond(?:ing|ed)?[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)/);
        reqs.bonding = amt ? `$${amt[1]}` : "Required";
    }
    if (/\binsurance\b|\bliability\b/i.test(text)) reqs.insurance = "Required";

    const period = lower.match(/(?:period\s+of\s+performance|base\s+(?:year|period)|contract\s+(?:period|duration))[^.]*?(\d+)\s*(year|month|day|week)/i);
    if (period) reqs.performance_period = `${period[1]} ${period[2]}${parseInt(period[1]) > 1 ? "s" : ""}`;

    if (/\btop\s+secret\b|\bts[/ ]sci\b/i.test(text)) reqs.clearance_level = "Top Secret";
    else if (/\bsecret\b(?!\s*(?:service|ary|ion))/i.test(text)) reqs.clearance_level = "Secret";

    return reqs;
}

function isEmpty(n: Normalized): boolean {
    return !n.min_workforce && !n.years_experience && !n.bonding && !n.insurance
        && !n.performance_period && !n.clearance_level && !n.equipment
        && (!n.certifications || n.certifications.length === 0)
        && (!n.scope_of_work || n.scope_of_work.length === 0)
        && (!n.qualifications || n.qualifications.length === 0)
        && (!n.deliverables || n.deliverables.length === 0);
}

export default function StructuredRequirements({ dbRequirements, noticeId }: Props) {
    const dbNorm = normalize(dbRequirements);
    const [fallback, setFallback] = useState<Normalized>({});
    const [loading, setLoading] = useState(false);

    const dbEmpty = isEmpty(dbNorm);

    useEffect(() => {
        if (!dbEmpty || !noticeId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/sam/description?noticeId=${encodeURIComponent(noticeId)}`);
                const data = await res.json();
                if (!cancelled && res.ok && data.description) {
                    setFallback(extractFromText(data.description));
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [dbEmpty, noticeId]);

    const reqs = dbEmpty ? fallback : dbNorm;
    const extracted = dbEmpty && !isEmpty(fallback);

    const Tile = ({ label, value }: { label: string; value: string | undefined }) => (
        <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100">
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1.5">{label}</p>
            <p className="font-bold text-stone-800 text-lg">{value || <span className="text-stone-400 font-normal text-base">Not Spec.</span>}</p>
        </div>
    );

    const Section = ({ icon: Icon, label, items }: { icon: typeof ListChecks; label: string; items: string[] | undefined }) => {
        if (!items || items.length === 0) return null;
        return (
            <div>
                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</p>
                <ul className="bg-stone-50/60 rounded-xl border border-stone-100 divide-y divide-stone-100">
                    {items.slice(0, 8).map((it, i) => (
                        <li key={i} className="px-3 sm:px-4 py-2 text-sm text-stone-700">{it}</li>
                    ))}
                </ul>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold flex items-center text-stone-800">
                    <Briefcase className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Structured Requirements
                </h2>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
                {extracted && (
                    <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Auto-Extracted
                    </span>
                )}
            </div>

            <div className="p-4 sm:p-8 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                    <Tile label="Min Workforce" value={reqs.min_workforce ? `${reqs.min_workforce}+` : undefined} />
                    <Tile label="Years Experience" value={reqs.years_experience ? `${reqs.years_experience} Years` : undefined} />
                    <Tile label="Bonding" value={reqs.bonding} />
                    <Tile label="Performance Period" value={reqs.performance_period} />
                    <Tile label="Security Clearance" value={reqs.clearance_level} />
                    <Tile label="Insurance" value={reqs.insurance} />
                    {reqs.place_of_performance && <Tile label="Place of Performance" value={reqs.place_of_performance} />}
                    <div className="bg-stone-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-stone-100 md:col-span-2">
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1.5">Equipment Required</p>
                        <p className="font-medium text-stone-800 text-sm line-clamp-2">{reqs.equipment || <span className="text-stone-400 font-normal">None specified.</span>}</p>
                    </div>
                </div>

                <Section icon={ListChecks} label="Scope of Work" items={reqs.scope_of_work} />
                <Section icon={Award} label="Qualifications" items={reqs.qualifications} />
                <Section icon={Package} label="Deliverables" items={reqs.deliverables} />
                <Section icon={FileText} label="FAR Clauses" items={reqs.far_clauses} />

                {reqs.certifications && reqs.certifications.length > 0 && (
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Required Certifications</p>
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-blue-900 text-sm flex flex-wrap gap-2">
                            {reqs.certifications.map((c, i) => (
                                <span key={i} className="bg-white border border-blue-200 px-2 py-0.5 rounded-md text-xs">{c}</span>
                            ))}
                        </div>
                    </div>
                )}

                {reqs.eval_criteria && (
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Evaluation Criteria Summary</p>
                        <div className="prose prose-sm prose-stone max-w-none text-stone-700">
                            <p>{reqs.eval_criteria}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
