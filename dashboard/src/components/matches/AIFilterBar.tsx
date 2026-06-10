"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, X, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";

export interface AIFilters {
    naics_code?: string;
    set_aside?: string;
    state?: string;
    notice_type?: string;
    min_score?: number;
    max_deadline_days?: number;
    keyword?: string;
}

export interface AIFilterProfileHints {
    naicsCodes?: string[];
    certifications?: string[];
    targetStates?: string[];
    primaryState?: string | null;
}

const STATE_NAMES: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
    WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const CERT_LABEL: Record<string, string> = {
    "8A": "8(a)",
    "SBA": "small business",
    "SDVOSB": "veteran-owned",
    "WOSB": "women-owned",
    "HUBZone": "HUBZone",
    "VSA": "veteran-owned",
};

function naicsShortLabel(code: string): string | null {
    const hit = NAICS_CODES.find(n => n.code === code);
    if (!hit) return null;
    // Trim "Services" suffix and lower-case for a chip-friendly phrase
    return hit.label.replace(/\s+Services$/i, "").trim().toLowerCase();
}

function buildSuggestions(hints?: AIFilterProfileHints): string[] {
    const out: string[] = [];

    const naics = hints?.naicsCodes?.[0];
    const state = hints?.primaryState || hints?.targetStates?.[0];
    const cert = hints?.certifications?.[0];

    // 1) HOT <industry> in <state>
    if (naics) {
        const ind = naicsShortLabel(naics) || "matches";
        if (state) {
            out.push(`HOT ${ind} in ${STATE_NAMES[state] || state}`);
        } else {
            out.push(`HOT ${ind} matches`);
        }
    } else if (state) {
        out.push(`HOT matches in ${STATE_NAMES[state] || state}`);
    } else {
        out.push("HOT matches closing this month");
    }

    // 2) Sources sought + cert (if user has one) else generic sources sought
    if (cert && CERT_LABEL[cert]) {
        out.push(`Sources sought ${CERT_LABEL[cert]}`);
    } else {
        out.push("Sources sought set-asides");
    }

    // 3) Expiring this week — universal
    out.push("Expiring this week");

    // 4) Industry + target state combo (different from #1) if available
    if (naics && hints?.targetStates && hints.targetStates.length > 1) {
        const other = hints.targetStates.find(s => s !== state) || hints.targetStates[1];
        const ind = naicsShortLabel(naics) || "opportunities";
        out.push(`${ind} in ${STATE_NAMES[other] || other}`);
    } else if (cert && CERT_LABEL[cert]) {
        out.push(`${CERT_LABEL[cert]} small business 8(a)`);
    } else {
        out.push("Construction in TX");
    }

    // 5) Strong matches under $1M (a useful universal query)
    out.push("Strong matches under $1M");

    // De-dupe + cap at 5
    return Array.from(new Set(out)).slice(0, 5);
}

export function AIFilterBar({
    onApply,
    activePrompt,
    onClear,
    profileHints,
}: {
    onApply: (filters: AIFilters, prompt: string) => void;
    activePrompt: string | null;
    onClear: () => void;
    profileHints?: AIFilterProfileHints;
}) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showChips, setShowChips] = useState(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRunRef = useRef<string>("");

    const suggestions = useMemo(() => buildSuggestions(profileHints), [profileHints]);

    const runAI = useCallback(async (prompt: string) => {
        const trimmed = prompt.trim();
        if (!trimmed) return;
        if (trimmed === lastRunRef.current) return; // avoid resubmitting the same prompt
        lastRunRef.current = trimmed;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/matches/ai-filter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: trimmed }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || "AI filter failed");
            }
            const data = await res.json();
            const filters = (data.filters || {}) as AIFilters;
            if (!filters || Object.keys(filters).length === 0) {
                setError("Couldn't parse any filters from that. Try simpler keywords like \"HOT janitorial in TX\".");
                return;
            }
            onApply(filters, trimmed);
            setText("");
            lastRunRef.current = "";
        } catch (e) {
            const msg = (e as Error).message || "";
            // Friendlier copy — keep things human (no buzzwords) per HUMANIZER rules
            if (/network|fetch|timeout|abort/i.test(msg)) {
                setError("Network hiccup — try again.");
            } else {
                setError("AI filter is having a moment. Try again or use the manual filters above.");
            }
        } finally {
            setLoading(false);
        }
    }, [onApply]);

    // Debounced auto-run after typing stops (500ms)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = text.trim();
        if (!trimmed) {
            setError(null);
            return;
        }
        // Skip super-short input — wait until user has typed something meaningful
        if (trimmed.length < 4) return;
        debounceRef.current = setTimeout(() => {
            if (!loading) runAI(trimmed);
        }, 500);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [text, loading, runAI]);

    const runChip = (chip: string) => {
        setText(chip);
        // Bypass debounce — fire immediately on chip click
        if (debounceRef.current) clearTimeout(debounceRef.current);
        runAI(chip);
        setShowChips(false);
    };

    const clearText = () => {
        setText("");
        setError(null);
        lastRunRef.current = "";
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };

    return (
        <div className="mb-3">
            <div className={clsx(
                "bg-gradient-to-r from-purple-50 via-white to-blue-50 p-2 rounded-full border border-purple-200 shadow-sm flex items-center transition-all",
                "focus-within:ring-2 focus-within:ring-purple-400 focus-within:border-transparent"
            )}>
                <Sparkles className="w-4 h-4 text-purple-500 ml-3 mr-2 flex-shrink-0" />
                <input
                    type="text"
                    placeholder="Describe what you're looking for, e.g. 'small business janitorial in TX closing in 30 days'"
                    className="bg-transparent border-none outline-none w-full text-stone-700 text-sm placeholder:text-stone-400"
                    value={text}
                    onChange={(e) => { setText(e.target.value); setShowChips(true); }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            if (debounceRef.current) clearTimeout(debounceRef.current);
                            runAI(text);
                        }
                        if (e.key === "Escape") clearText();
                    }}
                    disabled={loading}
                />
                {text && !loading && (
                    <button
                        type="button"
                        onClick={clearText}
                        title="Clear"
                        aria-label="Clear input"
                        className="text-stone-400 hover:text-stone-700 mr-1 p-1 rounded-full hover:bg-stone-100"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => {
                        if (debounceRef.current) clearTimeout(debounceRef.current);
                        runAI(text);
                    }}
                    disabled={loading || !text.trim()}
                    className="bg-black text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mr-1 flex items-center gap-1 disabled:opacity-50 hover:bg-stone-800"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI Filter
                </button>
            </div>

            {/* Suggestion chips — hidden once an AI prompt is active or user dismisses */}
            {!activePrompt && showChips && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mr-1">
                        Try
                    </span>
                    {suggestions.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => runChip(s)}
                            disabled={loading}
                            className="text-[11px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {error && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {activePrompt && (
                <div className="mt-2 inline-flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-medium px-3 py-1.5 rounded-full animate-in fade-in slide-in-from-top-1 duration-200">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    <span>AI set filters from: &ldquo;{activePrompt}&rdquo;</span>
                    <button type="button" onClick={onClear} title="Clear AI filter" className="hover:bg-purple-100 rounded p-0.5">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
}
