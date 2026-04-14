"use client";

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import clsx from "clsx";

export interface AIFilters {
    naics_code?: string;
    set_aside?: string;
    state?: string;
    notice_type?: string;
    min_score?: number;
    max_deadline_days?: number;
    keyword?: string;
}

export function AIFilterBar({
    onApply,
    activePrompt,
    onClear,
}: {
    onApply: (filters: AIFilters, prompt: string) => void;
    activePrompt: string | null;
    onClear: () => void;
}) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runAI = async () => {
        const prompt = text.trim();
        if (!prompt) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/matches/ai-filter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || "AI filter failed");
            }
            const data = await res.json();
            onApply(data.filters || {}, prompt);
            setText("");
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
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
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") runAI(); }}
                    disabled={loading}
                />
                <button
                    type="button"
                    onClick={runAI}
                    disabled={loading || !text.trim()}
                    className="bg-black text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mr-1 flex items-center gap-1 disabled:opacity-50 hover:bg-stone-800"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI Filter
                </button>
            </div>
            {error && (
                <p className="text-[11px] text-red-600 mt-1 ml-3">{error}</p>
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
