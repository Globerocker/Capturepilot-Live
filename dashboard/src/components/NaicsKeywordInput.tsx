"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";

interface Props {
    value: string;                       // selected NAICS code (digits) or ""
    onChange: (code: string) => void;
}

// Searchable NAICS filter that accepts either a numeric code or a keyword.
// Keyword matches (e.g. "IT", "janitorial") resolve to real NAICS codes via searchNaics().
export default function NaicsKeywordInput({ value, onChange }: Props) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Show the human label when a code is selected
    useEffect(() => {
        if (value && !open) {
            const found = NAICS_CODES.find(n => n.code === value);
            setQuery(found ? `${value} — ${found.label}` : value);
        }
    }, [value, open]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const results = useMemo(() => {
        const q = query.trim();
        if (!q) return [];
        // If the query is pure digits, treat as prefix match on code; otherwise keyword search.
        if (/^\d+$/.test(q)) {
            return NAICS_CODES.filter(n => n.code.startsWith(q)).slice(0, 20);
        }
        return searchNaics(q).slice(0, 20);
    }, [query]);

    const pick = (code: string) => {
        onChange(code);
        setOpen(false);
    };

    const clear = () => {
        onChange("");
        setQuery("");
    };

    return (
        <div ref={wrapRef} className="relative">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    placeholder="e.g. 541512 or IT services"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-3 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                />
                {value && (
                    <button
                        type="button"
                        onClick={clear}
                        title="Clear"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {open && results.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {results.map(n => (
                        <button
                            type="button"
                            key={n.code}
                            onClick={() => pick(n.code)}
                            className={clsx(
                                "w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center gap-2 border-b border-stone-50 last:border-0",
                                value === n.code && "bg-emerald-50",
                            )}
                        >
                            <span className="font-mono text-[11px] text-stone-500 flex-shrink-0">{n.code}</span>
                            <span className="truncate">{n.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
