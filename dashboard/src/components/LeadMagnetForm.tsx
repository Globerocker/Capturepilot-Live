"use client";

import { useState } from "react";
import { Mail, MapPin, CheckCircle2, Loader2, ChevronRight, ChevronDown, Pencil } from "lucide-react";
import clsx from "clsx";

const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC","PR","GU","VI",
];

const SBA_CERTS = [
    { key: "8(a)", label: "8(a) Business Development" },
    { key: "HUBZone", label: "HUBZone Certified" },
    { key: "SDVOSB", label: "Service-Disabled Veteran-Owned SB" },
    { key: "WOSB", label: "Women-Owned Small Business" },
    { key: "EDWOSB", label: "Economically Disadvantaged WOSB" },
    { key: "VOSB", label: "Veteran-Owned Small Business" },
    { key: "SDB", label: "Small Disadvantaged Business" },
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
    // Auto-collapse if crawler confidence is high enough
    const autoConfirmed = (crawlerConfidence ?? 0) >= 0.6;
    const [collapsed, setCollapsed] = useState(autoConfirmed);
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

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
    const [noCerts, setNoCerts] = useState(false);

    function toggleNaics(code: string) {
        setSelectedNaics(prev =>
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    }

    function toggleCert(key: string) {
        setNoCerts(false);
        setSelectedCerts(prev =>
            prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
        );
    }

    async function handleSubmit() {
        if (!email.trim()) {
            setError("Email is required");
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
                    email: email.trim(),
                    company_name: companyName.trim(),
                    state,
                    naics_codes: selectedNaics,
                    sba_certifications: noCerts ? [] : selectedCerts,
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

    if (submitted) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-[28px] p-6 sm:p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-typewriter font-bold text-base text-emerald-800 mb-1">Profile Updated</p>
                <p className="text-sm text-emerald-600">Your matches have been refreshed with your confirmed information.</p>
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
                        <Pencil className="w-3 h-3" /> Edit
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
                        {selectedNaics.slice(0, 3).map(code => (
                            <span key={code} className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-mono font-bold">{code}</span>
                        ))}
                        {selectedCerts.slice(0, 2).map(cert => (
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
                            <CheckCircle2 className="w-4 h-4 mr-2 text-blue-500" /> Review What We Found
                        </h2>
                        <p className="text-xs text-blue-700 mt-0.5">We pre-filled this from your website. Confirm or correct for better matches.</p>
                    </div>
                    {autoConfirmed && (
                        <button
                            type="button"
                            onClick={() => setCollapsed(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                            <ChevronDown className="w-3 h-3" /> Collapse
                        </button>
                    )}
                </div>
            </div>

            <div className="p-5 sm:p-8">
                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-5">
                    <div className={clsx(
                        "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center",
                        step === 1 ? "bg-black text-white" : "bg-emerald-500 text-white"
                    )}>
                        {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : "1"}
                    </div>
                    <div className="h-px flex-1 bg-stone-200" />
                    <div className={clsx(
                        "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center",
                        step === 2 ? "bg-black text-white" : "bg-stone-200 text-stone-400"
                    )}>
                        2
                    </div>
                </div>

                {step === 1 && (
                    <div className="space-y-4">
                        {/* Company Name */}
                        <div>
                            <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                                Company Name
                            </label>
                            <input
                                type="text"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                            />
                        </div>

                        {/* State */}
                        <div>
                            <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                                <MapPin className="w-3 h-3 inline mr-1" /> Primary State
                            </label>
                            <select
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 bg-white"
                            >
                                <option value="">Select state...</option>
                                {US_STATES.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        {/* NAICS Codes */}
                        <div>
                            <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                                Industry Codes (NAICS)
                            </label>
                            <div className="space-y-1.5">
                                {inferredNaics.map(n => (
                                    <label key={n.code} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-stone-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedNaics.includes(n.code)}
                                            onChange={() => toggleNaics(n.code)}
                                            className="w-4 h-4 rounded border-stone-300 text-black focus:ring-black"
                                        />
                                        <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                        <span className="text-sm text-stone-700">{n.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                                <Mail className="w-3 h-3 inline mr-1" /> Email Address *
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                                placeholder="you@company.com"
                                required
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="w-full bg-black text-white py-3 rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                        >
                            Next: Certifications <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-2">
                                SBA Certifications
                            </label>
                            <div className="space-y-1.5">
                                {SBA_CERTS.map(cert => (
                                    <label key={cert.key} className={clsx(
                                        "flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors",
                                        selectedCerts.includes(cert.key) && !noCerts
                                            ? "bg-blue-50 border-blue-200"
                                            : "bg-white border-stone-100 hover:bg-stone-50"
                                    )}>
                                        <input
                                            type="checkbox"
                                            checked={selectedCerts.includes(cert.key) && !noCerts}
                                            onChange={() => toggleCert(cert.key)}
                                            disabled={noCerts}
                                            className="w-4 h-4 rounded border-stone-300 text-black focus:ring-black"
                                        />
                                        <div>
                                            <span className="text-sm font-bold text-stone-700">{cert.key}</span>
                                            <span className="text-xs text-stone-500 ml-1.5">{cert.label}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <label className="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer mt-2 border border-stone-100 hover:bg-stone-50">
                                <input
                                    type="checkbox"
                                    checked={noCerts}
                                    onChange={() => {
                                        setNoCerts(!noCerts);
                                        if (!noCerts) setSelectedCerts([]);
                                    }}
                                    className="w-4 h-4 rounded border-stone-300 text-black focus:ring-black"
                                />
                                <span className="text-sm text-stone-500">None of these</span>
                            </label>
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="flex-1 bg-stone-100 text-stone-700 py-3 rounded-2xl font-bold text-sm hover:bg-stone-200 transition-all"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex-1 bg-black text-white py-3 rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {submitting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4" /> Get Better Matches</>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
