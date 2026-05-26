"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Loader2, Search, Target, Building2 } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";

const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR",
];

interface NaicsItem {
    code: string;
    label: string;
}

interface Props {
    analysisId: string;
    initialCompanyName: string;
    initialState: string | null;
    initialPrimaryKeywords: string[];
    initialNaicsCodes: NaicsItem[];
    initialTargetStates: string[];
    onClose: () => void;
    onSaved: () => void;
}

// Full-profile editor invoked from the "Edit Info & Re-Match" button at the top
// of the result page. Lets the operator correct name + state + keywords + NAICS
// in one pass, then hits /rescore with profile_overrides to update DB AND
// re-run matching against the corrected profile.
export default function ProfileEditModal({
    analysisId,
    initialCompanyName,
    initialState,
    initialPrimaryKeywords,
    initialNaicsCodes,
    initialTargetStates,
    onClose,
    onSaved,
}: Props) {
    const [companyName, setCompanyName] = useState(initialCompanyName);
    const [state, setState] = useState(initialState || "");
    const [keywordsText, setKeywordsText] = useState(initialPrimaryKeywords.join(", "));
    const [selectedNaics, setSelectedNaics] = useState<NaicsItem[]>(initialNaicsCodes);
    const [targetStates, setTargetStates] = useState<string[]>(initialTargetStates);
    const [naicsQuery, setNaicsQuery] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !submitting) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, submitting]);

    const naicsResults = useMemo(() => {
        const q = naicsQuery.trim().toLowerCase();
        if (q.length < 2) return [];
        const picked = new Set(selectedNaics.map(s => s.code));
        const matches: NaicsItem[] = [];
        for (const n of NAICS_CODES) {
            if (picked.has(n.code)) continue;
            const codeMatch = n.code.startsWith(q);
            const labelMatch = n.label.toLowerCase().includes(q);
            if (codeMatch || labelMatch) {
                matches.push({ code: n.code, label: n.label });
                if (matches.length >= 10) break;
            }
        }
        return matches;
    }, [naicsQuery, selectedNaics]);

    const addNaics = (item: NaicsItem) => {
        if (selectedNaics.length >= 5) {
            setError("Up to 5 NAICS codes.");
            return;
        }
        setError("");
        setSelectedNaics(prev => [...prev, item]);
        setNaicsQuery("");
    };

    const removeNaics = (code: string) => {
        setError("");
        setSelectedNaics(prev => prev.filter(s => s.code !== code));
    };

    const toggleTargetState = (st: string) => {
        setTargetStates(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]);
    };

    const handleSave = async () => {
        if (selectedNaics.length === 0) {
            setError("Pick at least one NAICS code.");
            return;
        }
        if (!companyName.trim()) {
            setError("Company name can't be blank.");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const keywords = keywordsText
                .split(/[,;\n]/)
                .map(k => k.trim())
                .filter(k => k.length >= 2);
            const res = await fetch("/api/analyze-company/rescore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    analysis_id: analysisId,
                    naics_codes: selectedNaics.map(s => s.code),
                    profile_overrides: {
                        company_name: companyName.trim(),
                        state: state || null,
                        primary_keywords: keywords,
                        target_states: targetStates,
                    },
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                setError(payload.error || "Failed to save & re-match");
                setSubmitting(false);
                return;
            }
            onSaved();
        } catch {
            setError("Network error — try again.");
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !submitting && onClose()}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-6 py-5 border-b border-stone-100">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg text-black">Edit Company Info</h2>
                            <p className="text-xs text-stone-500 mt-0.5">
                                Update any field below — saving re-runs match scoring against the corrected profile.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => !submitting && onClose()}
                        disabled={submitting}
                        className="text-stone-400 hover:text-stone-700 transition disabled:opacity-30"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {/* Company name */}
                    <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1.5 block">
                            Company name
                        </label>
                        <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Acme Corp"
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                    </div>

                    {/* Home state */}
                    <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1.5 block">
                            Home state
                        </label>
                        <select
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        >
                            <option value="">(none — leave blank)</option>
                            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* Primary keywords */}
                    <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1.5 block">
                            Primary keywords (comma-separated)
                        </label>
                        <textarea
                            value={keywordsText}
                            onChange={(e) => setKeywordsText(e.target.value)}
                            placeholder="executive search, talent acquisition, supply chain recruiting"
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                        <p className="text-[10px] text-stone-400 mt-1">
                            These drive keyword scoring. Use noun phrases — what a buyer would type to find you. Up to 8 kept.
                        </p>
                    </div>

                    {/* NAICS picker (reuses NaicsEditModal logic inline) */}
                    <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-2">
                            NAICS codes ({selectedNaics.length}/5)
                        </p>
                        {selectedNaics.length === 0 ? (
                            <div className="bg-stone-50 border border-dashed border-stone-200 rounded-xl px-4 py-4 text-center">
                                <p className="text-xs text-stone-400">No codes selected — add at least one below.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {selectedNaics.map((s) => (
                                    <div
                                        key={s.code}
                                        className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"
                                    >
                                        <span className="font-mono text-xs font-bold bg-white border border-emerald-200 px-2 py-0.5 rounded">
                                            {s.code}
                                        </span>
                                        <span className="text-xs text-stone-800 flex-1 truncate">{s.label}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeNaics(s.code)}
                                            className="text-stone-400 hover:text-red-600 transition flex-shrink-0"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="relative mt-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                value={naicsQuery}
                                onChange={(e) => setNaicsQuery(e.target.value)}
                                placeholder="Add code — search by code (561312) or label (executive search)"
                                className="w-full pl-10 pr-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                            />
                        </div>
                        {naicsResults.length > 0 && (
                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1 border border-stone-100 rounded-xl p-2">
                                {naicsResults.map((r) => (
                                    <button
                                        key={r.code}
                                        type="button"
                                        onClick={() => addNaics(r)}
                                        className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-stone-50 transition text-left group"
                                    >
                                        <span className="font-mono text-[10px] font-bold bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded text-stone-700 flex-shrink-0">
                                            {r.code}
                                        </span>
                                        <span className="text-xs text-stone-700 flex-1 truncate">{r.label}</span>
                                        <Plus className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-600 flex-shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Target states */}
                    <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1.5 block">
                            Target states ({targetStates.length} selected)
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            <button
                                type="button"
                                onClick={() => setTargetStates(US_STATES.slice(0, 50))}
                                className="text-[10px] font-bold border border-stone-300 hover:border-emerald-400 text-stone-700 hover:text-emerald-700 px-2 py-1 rounded-md transition"
                            >
                                Select all 50
                            </button>
                            <button
                                type="button"
                                onClick={() => setTargetStates([])}
                                className="text-[10px] font-bold border border-stone-300 hover:border-red-300 text-stone-500 hover:text-red-600 px-2 py-1 rounded-md transition"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                            {US_STATES.map(st => (
                                <button
                                    key={st}
                                    type="button"
                                    onClick={() => toggleTargetState(st)}
                                    className={clsx(
                                        "text-[10px] font-bold px-1.5 py-1 rounded border transition",
                                        targetStates.includes(st)
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                            : "bg-white text-stone-400 border-stone-200 hover:border-stone-400 hover:text-stone-700",
                                    )}
                                >
                                    {st}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-stone-100 px-6 py-4 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="text-sm font-medium text-stone-600 hover:text-stone-900 px-4 py-2 disabled:opacity-30"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={submitting || selectedNaics.length === 0}
                        className={clsx(
                            "text-sm font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 transition",
                            submitting || selectedNaics.length === 0
                                ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                                : "bg-emerald-600 text-white hover:bg-emerald-700",
                        )}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving & Re-matching...
                            </>
                        ) : (
                            <>
                                <Target className="w-4 h-4" />
                                Save & Re-Match
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
