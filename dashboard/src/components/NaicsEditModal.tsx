"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Loader2, Search, Target } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";

interface NaicsItem {
    code: string;
    label: string;
}

interface Props {
    analysisId: string;
    initialCodes: NaicsItem[];
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Modal for editing the NAICS codes used to score a Quick Checker analysis.
 * Lets users remove existing codes, search/add new ones from the catalog,
 * then triggers a re-score via /api/analyze-company/rescore.
 */
export default function NaicsEditModal({ analysisId, initialCodes, onClose, onSaved }: Props) {
    const [selected, setSelected] = useState<NaicsItem[]>(initialCodes);
    const [query, setQuery] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Close on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !submitting) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, submitting]);

    // Search the static NAICS catalog (1000+ codes) — fast client-side filter
    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];
        const selectedCodes = new Set(selected.map(s => s.code));
        const matches: NaicsItem[] = [];
        for (const n of NAICS_CODES) {
            if (selectedCodes.has(n.code)) continue;
            const codeMatch = n.code.startsWith(q);
            const labelMatch = n.label.toLowerCase().includes(q);
            if (codeMatch || labelMatch) {
                matches.push({ code: n.code, label: n.label });
                if (matches.length >= 12) break;
            }
        }
        return matches;
    }, [query, selected]);

    const addCode = (item: NaicsItem) => {
        if (selected.length >= 5) {
            setError("You can select up to 5 NAICS codes.");
            return;
        }
        setError("");
        setSelected(prev => [...prev, item]);
        setQuery("");
    };

    const removeCode = (code: string) => {
        setError("");
        setSelected(prev => prev.filter(s => s.code !== code));
    };

    const handleSave = async () => {
        if (selected.length === 0) {
            setError("Pick at least one NAICS code.");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/analyze-company/rescore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    analysis_id: analysisId,
                    naics_codes: selected.map(s => s.code),
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                setError(payload.error || "Failed to rescore");
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
                            <Target className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg text-black">Edit NAICS Codes</h2>
                            <p className="text-xs text-stone-500 mt-0.5">
                                Refine the codes we use to find your matches. Up to 5 codes.
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

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {/* Selected codes */}
                    <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-2">
                            Selected ({selected.length}/5)
                        </p>
                        {selected.length === 0 ? (
                            <div className="bg-stone-50 border border-dashed border-stone-200 rounded-xl px-4 py-6 text-center">
                                <p className="text-xs text-stone-400">No codes selected. Add at least one below.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {selected.map((s) => (
                                    <div
                                        key={s.code}
                                        className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"
                                    >
                                        <span className="font-mono text-sm font-bold bg-white border border-emerald-200 px-2 py-0.5 rounded">
                                            {s.code}
                                        </span>
                                        <span className="text-sm text-stone-800 flex-1 truncate">{s.label}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeCode(s.code)}
                                            className="text-stone-400 hover:text-red-600 transition flex-shrink-0"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Search */}
                    <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-2">
                            Add a code
                        </p>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by code (e.g. 561720) or industry (e.g. janitorial)"
                                className="w-full pl-10 pr-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                            />
                        </div>
                        {query.length >= 2 && searchResults.length === 0 && (
                            <p className="text-xs text-stone-400 mt-2 px-1">No matches in the catalog.</p>
                        )}
                        {searchResults.length > 0 && (
                            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-1">
                                {searchResults.map((r) => (
                                    <button
                                        key={r.code}
                                        type="button"
                                        onClick={() => addCode(r)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-stone-50 transition text-left group border border-transparent hover:border-stone-200"
                                    >
                                        <span className="font-mono text-xs font-bold bg-stone-100 border border-stone-200 px-2 py-0.5 rounded text-stone-700 flex-shrink-0">
                                            {r.code}
                                        </span>
                                        <span className="text-xs text-stone-700 flex-1 truncate">{r.label}</span>
                                        <Plus className="w-4 h-4 text-stone-400 group-hover:text-emerald-600 flex-shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
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
                        disabled={submitting || selected.length === 0}
                        className={clsx(
                            "text-sm font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 transition",
                            submitting || selected.length === 0
                                ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                                : "bg-black text-white hover:bg-stone-800",
                        )}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Re-scoring...
                            </>
                        ) : (
                            <>Save & Re-score</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
