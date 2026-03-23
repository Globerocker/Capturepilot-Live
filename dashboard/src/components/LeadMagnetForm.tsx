"use client";

import { useState, useMemo } from "react";
import { Mail, MapPin, CheckCircle2, Loader2, Pencil, RefreshCw, Search, Plus } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";

const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC","PR","GU","VI",
];

const SBA_CERTS = [
    { key: "8(a)", label: "8(a)" },
    { key: "HUBZone", label: "HUBZone" },
    { key: "SDVOSB", label: "SDVOSB" },
    { key: "WOSB", label: "WOSB" },
    { key: "EDWOSB", label: "EDWOSB" },
    { key: "VOSB", label: "VOSB" },
    { key: "SDB", label: "SDB" },
];

interface LeadMagnetFormProps {
    analysisId: string;
    inferredProfile: Record<string, unknown>;
    inferredNaics: { code: string; label: string; confidence: number }[];
    crawlerConfidence?: number;
    onUpdate?: (data: {
        updated_matches: unknown[];
        cert_recommendations: unknown[];
        easy_wins: unknown[];
        total_matches: number;
    }) => void;
}

export function LeadMagnetForm({ analysisId, inferredProfile, inferredNaics, crawlerConfidence, onUpdate }: LeadMagnetFormProps) {
    // Auto-collapse if crawler confidence is high enough AND we have NAICS
    const autoConfirmed = (crawlerConfidence ?? 0) >= 0.6 && inferredNaics.length > 0;
    const [collapsed, setCollapsed] = useState(autoConfirmed);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");
    const [naicsSearch, setNaicsSearch] = useState("");
    const [showNaicsPicker, setShowNaicsPicker] = useState(inferredNaics.length === 0);

    // Pre-fill from inferred profile
    const [companyName, setCompanyName] = useState(
        (inferredProfile.company_name as string) || ""
    );
    const [state, setState] = useState(
        (inferredProfile.state as string) || ""
    );
    const [email, setEmail] = useState(
        (inferredProfile.email as string) || ""
    );
    const [selectedNaics, setSelectedNaics] = useState<string[]>(
        (inferredProfile.naics_codes as string[]) || inferredNaics.map(n => n.code)
    );
    const [selectedCerts, setSelectedCerts] = useState<string[]>(
        (inferredProfile.sba_certifications as string[]) || []
    );

    // Build the full list of NAICS options: inferred first, then browsable catalog
    const inferredCodes = new Set(inferredNaics.map(n => n.code));

    // Filtered NAICS for the picker (search or popular)
    const filteredNaics = useMemo(() => {
        const q = naicsSearch.trim().toLowerCase();
        if (!q) {
            // Show popular codes not already in inferred list
            return NAICS_CODES.filter(n => n.popular && !inferredCodes.has(n.code) && !selectedNaics.includes(n.code));
        }
        return NAICS_CODES.filter(n =>
            !inferredCodes.has(n.code) &&
            !selectedNaics.includes(n.code) &&
            (n.code.includes(q) || n.label.toLowerCase().includes(q))
        );
    }, [naicsSearch, inferredCodes, selectedNaics]);

    function toggleNaics(code: string) {
        setSelectedNaics(prev =>
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    }

    function addNaics(code: string) {
        setSelectedNaics(prev => prev.includes(code) ? prev : [...prev, code]);
        setNaicsSearch("");
    }

    function toggleCert(key: string) {
        setSelectedCerts(prev =>
            prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
        );
    }

    async function handleSubmit() {
        if (selectedNaics.length === 0) {
            setError("Select at least one NAICS code");
            return;
        }
        setSubmitting(true);
        setError("");

        try {
            const res = await fetch("/api/lead-magnet/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    analysis_id: analysisId,
                    email: email.trim() || undefined,
                    company_name: companyName.trim(),
                    state,
                    naics_codes: selectedNaics,
                    sba_certifications: selectedCerts,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to update");
            }

            const data = await res.json();
            setSubmitted(true);
            onUpdate?.(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    // Get label for a NAICS code
    function naicsLabel(code: string): string {
        const inferred = inferredNaics.find(n => n.code === code);
        if (inferred) return inferred.label;
        const fromList = NAICS_CODES.find(n => n.code === code);
        return fromList?.label || code;
    }

    if (submitted) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-[28px] p-5 sm:p-6 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                <div>
                    <p className="font-typewriter font-bold text-sm text-emerald-800">Matches Refreshed</p>
                    <p className="text-xs text-emerald-600">Results updated with your confirmed profile.</p>
                </div>
            </div>
        );
    }

    // Collapsed state: show summary of what was detected + edit button
    if (collapsed) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-[28px] overflow-hidden">
                <div className="px-5 sm:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <h2 className="font-typewriter font-bold text-sm text-emerald-800">
                            Profile Auto-Detected
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsed(false)}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors"
                    >
                        <Pencil className="w-3 h-3" /> Edit & Re-Match
                    </button>
                </div>
                <div className="px-5 sm:px-8 pb-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                        {companyName && (
                            <span className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-medium">{companyName}</span>
                        )}
                        {state && (
                            <span className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-medium">
                                <MapPin className="w-3 h-3 inline mr-0.5" />{state}
                            </span>
                        )}
                        {selectedNaics.map(code => (
                            <span key={code} className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-mono font-bold">{code}</span>
                        ))}
                        {selectedCerts.map(cert => (
                            <span key={cert} className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-bold">{cert}</span>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-5 sm:px-8 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-typewriter font-bold text-base flex items-center text-blue-900">
                            <CheckCircle2 className="w-4 h-4 mr-2 text-blue-500" /> Review & Refine
                        </h2>
                        <p className="text-xs text-blue-700 mt-0.5">Correct NAICS codes and state for better matches.</p>
                    </div>
                    {autoConfirmed && (
                        <button
                            type="button"
                            onClick={() => setCollapsed(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                            Collapse
                        </button>
                    )}
                </div>
            </div>

            <div className="p-5 sm:p-8 space-y-4">
                {/* Row 1: Company Name + State side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            Company Name
                        </label>
                        <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Acme Corp"
                            className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            <MapPin className="w-3 h-3 inline mr-1" /> State
                        </label>
                        <select
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            aria-label="State"
                            className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 bg-white"
                        >
                            <option value="">Select...</option>
                            {US_STATES.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* NAICS Codes — the key field */}
                <div>
                    <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                        Industry Codes (NAICS) — select all that apply
                    </label>

                    {/* Selected NAICS chips (always visible) */}
                    {selectedNaics.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {selectedNaics.map(code => {
                                const inf = inferredNaics.find(n => n.code === code);
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => toggleNaics(code)}
                                        className="flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors group"
                                        title={`Click to remove ${code}`}
                                    >
                                        <span className="font-mono">{code}</span>
                                        <span className="text-blue-600 group-hover:text-red-500">{naicsLabel(code)}</span>
                                        {inf && (
                                            <span className={clsx(
                                                "text-[10px] px-1 py-0.5 rounded ml-0.5",
                                                inf.confidence >= 0.7 ? "text-emerald-600 bg-emerald-50" :
                                                inf.confidence >= 0.4 ? "text-amber-600 bg-amber-50" :
                                                "text-stone-400 bg-stone-50"
                                            )}>
                                                {Math.round(inf.confidence * 100)}%
                                            </span>
                                        )}
                                        <span className="text-stone-300 group-hover:text-red-400 text-[10px]">✕</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Inferred NAICS checkboxes (only for unselected inferred codes) */}
                    {inferredNaics.filter(n => !selectedNaics.includes(n.code)).length > 0 && (
                        <div className="space-y-1.5 mb-3">
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Detected from website</p>
                            {inferredNaics.filter(n => !selectedNaics.includes(n.code)).map(n => (
                                <button
                                    key={n.code}
                                    type="button"
                                    onClick={() => addNaics(n.code)}
                                    className="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border border-stone-100 hover:bg-blue-50 hover:border-blue-200 transition-colors w-full text-left"
                                >
                                    <Plus className="w-3.5 h-3.5 text-stone-400" />
                                    <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                    <span className="text-sm text-stone-700 flex-1">{n.label}</span>
                                    <span className={clsx(
                                        "text-[10px] font-typewriter font-bold px-1.5 py-0.5 rounded",
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

                    {/* Add more NAICS — search picker */}
                    {!showNaicsPicker && (
                        <button
                            type="button"
                            onClick={() => setShowNaicsPicker(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" /> Add more industry codes
                        </button>
                    )}

                    {showNaicsPicker && (
                        <div className="border border-stone-200 rounded-xl overflow-hidden">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                                <input
                                    type="text"
                                    value={naicsSearch}
                                    onChange={(e) => setNaicsSearch(e.target.value)}
                                    placeholder="Search by code or industry name..."
                                    className="w-full pl-9 pr-4 py-2.5 text-sm border-b border-stone-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filteredNaics.length === 0 ? (
                                    <p className="text-xs text-stone-400 p-3 text-center">
                                        {naicsSearch ? "No matching codes found" : "All popular codes already selected"}
                                    </p>
                                ) : (
                                    filteredNaics.slice(0, 15).map(n => (
                                        <button
                                            key={n.code}
                                            type="button"
                                            onClick={() => addNaics(n.code)}
                                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors w-full text-left border-b border-stone-50 last:border-0"
                                        >
                                            <Plus className="w-3.5 h-3.5 text-blue-500" />
                                            <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                            <span className="text-sm text-stone-700">{n.label}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {selectedNaics.length === 0 && (
                        <p className="text-xs text-amber-600 mt-2">Select at least one NAICS code to find matching opportunities.</p>
                    )}
                </div>

                {/* SBA Certifications — compact inline chips */}
                <div>
                    <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                        SBA Certifications
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SBA_CERTS.map(cert => (
                            <button
                                key={cert.key}
                                type="button"
                                onClick={() => toggleCert(cert.key)}
                                className={clsx(
                                    "text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                    selectedCerts.includes(cert.key)
                                        ? "bg-blue-50 text-blue-700 border-blue-300"
                                        : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                                )}
                            >
                                {cert.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Email — optional */}
                <div>
                    <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                        <Mail className="w-3 h-3 inline mr-1" /> Email <span className="normal-case text-stone-300">(optional)</span>
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                        placeholder="you@company.com"
                    />
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full bg-black text-white py-3 rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Re-scoring...</>
                    ) : (
                        <><RefreshCw className="w-4 h-4" /> Re-Match with These Settings</>
                    )}
                </button>
            </div>
        </div>
    );
}
