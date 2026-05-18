"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
    Building2, MapPin, Users, Calendar, DollarSign, Award, Search, Plus,
    CheckCircle2, Loader2, AlertTriangle, ArrowRight, Sparkles, Globe, Target,
} from "lucide-react";
import { NAICS_CODES } from "@/lib/naics-codes";

const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC","PR","GU","VI",
];

const SBA_CERTS: { key: string; label: string }[] = [
    { key: "8(a)", label: "8(a)" },
    { key: "HUBZone", label: "HUBZone" },
    { key: "SDVOSB", label: "SDVOSB" },
    { key: "WOSB", label: "WOSB" },
    { key: "EDWOSB", label: "EDWOSB" },
    { key: "VOSB", label: "VOSB" },
    { key: "SDB", label: "SDB" },
];

const REVENUE_BANDS: { key: string; label: string }[] = [
    { key: "under_1m", label: "Under $1M" },
    { key: "1m_5m", label: "$1M – $5M" },
    { key: "5m_25m", label: "$5M – $25M" },
    { key: "25m_plus", label: "$25M+" },
    { key: "prefer_not_to_say", label: "Prefer not to say" },
];

interface InferredNaicsItem {
    code: string;
    label: string;
    confidence: number;
    matched_keywords?: string[];
}

interface InferredProfile {
    company_name?: string;
    state?: string;
    naics_codes?: string[];
    sba_certifications?: string[];
    employee_count?: number | null;
    years_in_business?: number | null;
    annual_revenue_band?: string | null;
    target_states?: string[];
    [key: string]: unknown;
}

interface Props {
    analysisId: string;
    companyName: string;
    website: string;
    inferredNaics: InferredNaicsItem[];
    inferredProfile: InferredProfile;
    crawlerConfidence?: number;
    /** Called immediately after a successful submit, so the parent can flip to a polling state. */
    onSubmitted: () => void;
}

/**
 * Mid-funnel data-review step. Renders BEFORE the results page so the user
 * can fix anything the crawler got wrong (employee count, NAICS, certs, etc.)
 * before we score 40k opportunities against bad data.
 *
 * Reads the inferred values as defaults, but every field is editable.
 * On submit, posts to /api/analyze-company/confirm which kicks off the
 * scoring pipeline. Parent then polls status until "complete".
 */
export default function ConfirmFoundDataStep({
    analysisId,
    companyName: initialCompanyName,
    website,
    inferredNaics,
    inferredProfile,
    crawlerConfidence,
    onSubmitted,
}: Props) {
    const router = useRouter();

    const [companyName, setCompanyName] = useState(inferredProfile.company_name || initialCompanyName || "");
    const [state, setState] = useState(inferredProfile.state || "");
    const [employeeCount, setEmployeeCount] = useState<string>(
        inferredProfile.employee_count ? String(inferredProfile.employee_count) : ""
    );
    const [yearsInBusiness, setYearsInBusiness] = useState<string>(
        inferredProfile.years_in_business ? String(inferredProfile.years_in_business) : ""
    );
    const [revenueBand, setRevenueBand] = useState<string>(inferredProfile.annual_revenue_band || "");
    const [selectedNaics, setSelectedNaics] = useState<string[]>(
        inferredProfile.naics_codes && inferredProfile.naics_codes.length > 0
            ? inferredProfile.naics_codes
            : inferredNaics.map(n => n.code)
    );
    const [selectedCerts, setSelectedCerts] = useState<string[]>(inferredProfile.sba_certifications || []);
    const [naicsSearch, setNaicsSearch] = useState("");
    const [showNaicsPicker, setShowNaicsPicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const inferredCodeSet = useMemo(() => new Set(inferredNaics.map(n => n.code)), [inferredNaics]);

    const filteredNaics = useMemo(() => {
        const q = naicsSearch.trim().toLowerCase();
        if (!q) {
            return NAICS_CODES.filter(n => n.popular && !inferredCodeSet.has(n.code) && !selectedNaics.includes(n.code)).slice(0, 12);
        }
        return NAICS_CODES.filter(n =>
            !selectedNaics.includes(n.code) && (n.code.includes(q) || n.label.toLowerCase().includes(q))
        ).slice(0, 15);
    }, [naicsSearch, inferredCodeSet, selectedNaics]);

    function naicsLabel(code: string): string {
        const inf = inferredNaics.find(n => n.code === code);
        if (inf) return inf.label;
        const fromList = NAICS_CODES.find(n => n.code === code);
        return fromList?.label || code;
    }

    function toggleNaics(code: string) {
        setSelectedNaics(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    }
    function addNaics(code: string) {
        setSelectedNaics(prev => prev.includes(code) ? prev : [...prev, code]);
        setNaicsSearch("");
    }
    function toggleCert(key: string) {
        setSelectedCerts(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
    }

    function validate(): string | null {
        if (!companyName.trim()) return "Confirm your company name";
        if (selectedNaics.length === 0) return "Pick at least one industry (NAICS) code";
        if (!state) return "Pick your primary state";
        if (employeeCount && Number(employeeCount) < 1) return "Employee count must be at least 1";
        return null;
    }

    async function handleSubmit() {
        const err = validate();
        if (err) {
            setError(err);
            return;
        }
        setError("");
        setSubmitting(true);
        try {
            const res = await fetch("/api/analyze-company/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    analysis_id: analysisId,
                    company_name: companyName.trim(),
                    state,
                    naics_codes: selectedNaics,
                    sba_certifications: selectedCerts,
                    employee_count: employeeCount ? Number(employeeCount) : undefined,
                    years_in_business: yearsInBusiness ? Number(yearsInBusiness) : undefined,
                    annual_revenue_band: revenueBand || undefined,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Could not save corrections (${res.status})`);
            }
            // Tell the parent to start polling for scoring/complete
            onSubmitted();
            // Force a refresh so polling state takes over
            router.refresh();
        } catch (e) {
            setError((e as Error).message);
            setSubmitting(false);
        }
    }

    const lowConfidence = (crawlerConfidence ?? 0) < 0.5;
    const employeeNum = employeeCount ? Number(employeeCount) : 0;
    const looksTooBigForSmallBiz = employeeNum >= 500 || revenueBand === "25m_plus";

    return (
        <div className="min-h-screen bg-stone-50 px-4 py-8 sm:py-12">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="text-center mb-7">
                    <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Step 2 of 2 · Confirm what we found
                    </div>
                    <h1 className="font-black text-3xl sm:text-4xl text-stone-900">
                        Almost there — let&apos;s confirm a few things.
                    </h1>
                    <p className="text-sm text-stone-500 mt-3 max-w-xl mx-auto leading-relaxed">
                        We crawled <strong>{website.replace(/^https?:\/\//, "")}</strong> and prefilled the fields below.
                        Fix anything that looks wrong — better data = better matches.
                    </p>
                </div>

                {lowConfidence && (
                    <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-900">
                            <p className="font-bold">Heads up — our crawler had limited signal from your website.</p>
                            <p className="text-amber-800/80 mt-0.5">Please double-check every field below before continuing.</p>
                        </div>
                    </div>
                )}

                <div className="bg-white border border-stone-200 rounded-[28px] shadow-sm overflow-hidden">
                    {/* Identity */}
                    <div className="p-5 sm:p-7 border-b border-stone-100 space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Identity</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                    <Building2 className="w-3 h-3 inline mr-1" /> Company name
                                </label>
                                <input
                                    type="text"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                    placeholder="Acme Logistics Inc."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                    <Globe className="w-3 h-3 inline mr-1" /> Website
                                </label>
                                <input
                                    type="text"
                                    value={website}
                                    disabled
                                    className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm bg-stone-50 text-stone-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Size signals */}
                    <div className="p-5 sm:p-7 border-b border-stone-100 space-y-4">
                        <div className="flex items-baseline justify-between flex-wrap gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Company size</p>
                            <p className="text-[10px] text-stone-400">Used to filter set-asides you actually qualify for</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                    <Users className="w-3 h-3 inline mr-1" /> Employees
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    value={employeeCount}
                                    onChange={(e) => setEmployeeCount(e.target.value.replace(/\D/g, ""))}
                                    placeholder="12"
                                    className="w-full px-3 py-2.5 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                    <Calendar className="w-3 h-3 inline mr-1" /> Years in business
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={yearsInBusiness}
                                    onChange={(e) => setYearsInBusiness(e.target.value.replace(/\D/g, ""))}
                                    placeholder="5"
                                    className="w-full px-3 py-2.5 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                    <DollarSign className="w-3 h-3 inline mr-1" /> Annual revenue
                                </label>
                                <select
                                    value={revenueBand}
                                    onChange={(e) => setRevenueBand(e.target.value)}
                                    aria-label="Annual revenue"
                                    className="w-full px-3 py-2.5 rounded-xl border-2 border-stone-200 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                >
                                    <option value="">Select…</option>
                                    {REVENUE_BANDS.map(b => (
                                        <option key={b.key} value={b.key}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {looksTooBigForSmallBiz && (
                            <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                                Heads up: at this size, we&apos;ll skip generic &ldquo;small business&rdquo; set-asides since you wouldn&apos;t qualify.
                                Specific certs (8(a), HUBZone, etc.) still work.
                            </p>
                        )}
                    </div>

                    {/* Location */}
                    <div className="p-5 sm:p-7 border-b border-stone-100 space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Where you work</p>
                        <div>
                            <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                <MapPin className="w-3 h-3 inline mr-1" /> Primary state
                            </label>
                            <select
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                aria-label="Primary state"
                                className="w-full sm:w-1/3 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                            >
                                <option value="">Select…</option>
                                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Industry / NAICS */}
                    <div className="p-5 sm:p-7 border-b border-stone-100 space-y-4">
                        <div className="flex items-baseline justify-between flex-wrap gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Industry codes (NAICS)</p>
                            <p className="text-[10px] text-stone-400">Pick all that apply — this is the #1 driver of match quality</p>
                        </div>

                        {/* Selected NAICS chips */}
                        {selectedNaics.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {selectedNaics.map(code => {
                                    const inf = inferredNaics.find(n => n.code === code);
                                    return (
                                        <button
                                            key={code}
                                            type="button"
                                            onClick={() => toggleNaics(code)}
                                            className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors group"
                                            title={`Remove ${code}`}
                                        >
                                            <span className="font-mono">{code}</span>
                                            <span className="font-normal text-emerald-700 group-hover:text-red-500 truncate max-w-[20ch]">
                                                {naicsLabel(code)}
                                            </span>
                                            {inf && (
                                                <span className={clsx(
                                                    "text-[10px] px-1 py-0.5 rounded",
                                                    inf.confidence >= 0.7 ? "text-emerald-700 bg-emerald-100" :
                                                    inf.confidence >= 0.4 ? "text-amber-700 bg-amber-100" :
                                                    "text-stone-500 bg-stone-100"
                                                )}>
                                                    {Math.round(inf.confidence * 100)}%
                                                </span>
                                            )}
                                            <span className="text-emerald-400 group-hover:text-red-400 text-[11px]">✕</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Detected NAICS suggestions not yet picked */}
                        {inferredNaics.filter(n => !selectedNaics.includes(n.code)).length > 0 && (
                            <div className="space-y-1.5">
                                <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                                    Other detected codes
                                </p>
                                {inferredNaics.filter(n => !selectedNaics.includes(n.code)).map(n => (
                                    <button
                                        key={n.code}
                                        type="button"
                                        onClick={() => addNaics(n.code)}
                                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-stone-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors w-full text-left"
                                    >
                                        <Plus className="w-3.5 h-3.5 text-stone-400" />
                                        <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                        <span className="text-sm text-stone-700 flex-1 truncate">{n.label}</span>
                                        <span className={clsx(
                                            "text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0",
                                            n.confidence >= 0.7 ? "text-emerald-600 bg-emerald-50" :
                                            n.confidence >= 0.4 ? "text-amber-600 bg-amber-50" :
                                            "text-stone-400 bg-stone-50"
                                        )}>
                                            {Math.round(n.confidence * 100)}%
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Add more — search picker */}
                        {!showNaicsPicker ? (
                            <button
                                type="button"
                                onClick={() => setShowNaicsPicker(true)}
                                className="text-xs text-emerald-700 hover:text-emerald-900 font-bold inline-flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Add another industry code
                            </button>
                        ) : (
                            <div className="border border-stone-200 rounded-xl overflow-hidden">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                                    <input
                                        type="text"
                                        value={naicsSearch}
                                        onChange={(e) => setNaicsSearch(e.target.value)}
                                        placeholder="Search by code or industry name…"
                                        className="w-full pl-9 pr-4 py-2.5 text-sm border-b border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                    />
                                </div>
                                <div className="max-h-56 overflow-y-auto">
                                    {filteredNaics.length === 0 ? (
                                        <p className="text-xs text-stone-400 p-3 text-center">
                                            {naicsSearch ? "No matches" : "Type to search NAICS codes"}
                                        </p>
                                    ) : (
                                        filteredNaics.map(n => (
                                            <button
                                                key={n.code}
                                                type="button"
                                                onClick={() => addNaics(n.code)}
                                                className="flex items-center gap-2.5 px-3 py-2 hover:bg-emerald-50 transition-colors w-full text-left border-b border-stone-50 last:border-0"
                                            >
                                                <Plus className="w-3.5 h-3.5 text-emerald-500" />
                                                <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                                <span className="text-sm text-stone-700 truncate">{n.label}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Certifications */}
                    <div className="p-5 sm:p-7 border-b border-stone-100 space-y-4">
                        <div className="flex items-baseline justify-between flex-wrap gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                <Award className="w-3 h-3 inline mr-1" /> SBA certifications
                            </p>
                            <p className="text-[10px] text-stone-400">Tick all you currently hold</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {SBA_CERTS.map(cert => (
                                <button
                                    key={cert.key}
                                    type="button"
                                    onClick={() => toggleCert(cert.key)}
                                    className={clsx(
                                        "text-xs font-bold px-3 py-2 rounded-lg border-2 transition-colors",
                                        selectedCerts.includes(cert.key)
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-400"
                                            : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                                    )}
                                >
                                    {selectedCerts.includes(cert.key) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                    {cert.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <div className="p-5 sm:p-7 bg-stone-50">
                        {error && (
                            <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200 mb-3">
                                {error}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 text-white py-4 rounded-2xl font-black text-base hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                        >
                            {submitting ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Scoring opportunities for you…</>
                            ) : (
                                <><Sparkles className="w-5 h-5" /> Confirm & Find My Matches <ArrowRight className="w-4 h-4" /></>
                            )}
                        </button>
                        <p className="text-[11px] text-stone-400 text-center mt-3">
                            <Target className="w-3 h-3 inline mr-0.5" /> Next: we score 40,000+ opportunities against the data above. Takes ~30 seconds.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
