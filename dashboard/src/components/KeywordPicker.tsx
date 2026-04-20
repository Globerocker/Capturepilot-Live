"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Plus, GripVertical } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

// Library row shape (mirrors gov_keywords table).
interface GovKeyword {
    keyword: string;
    display_label: string;
    category: string | null;
    aliases: string[];
    frequency: number;
    title_frequency: number;
}

interface Props {
    primary: string[];              // canonical keyword strings
    secondary: string[];
    onChange: (primary: string[], secondary: string[]) => void;
    maxPrimary?: number;
    maxSecondary?: number;
    // Optional list of AI-suggested keywords to highlight in the typeahead.
    suggestions?: string[];
}

// Shared picker used in onboarding + settings. Hits public.gov_keywords via
// the authenticated supabase client (RLS: read-only for authenticated users).
export default function KeywordPicker({
    primary,
    secondary,
    onChange,
    maxPrimary = 3,
    maxSecondary = 5,
    suggestions = [],
}: Props) {
    const sb = useMemo(() => createSupabaseClient(), []);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GovKeyword[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    // Which bucket a new pick goes into. Defaults to whichever still has room.
    const [mode, setMode] = useState<"primary" | "secondary">(
        primary.length < maxPrimary ? "primary" : "secondary"
    );
    const wrapRef = useRef<HTMLDivElement>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep labels for selected keywords so chips can render the pretty form.
    const [labels, setLabels] = useState<Map<string, string>>(new Map());
    // Inline add-error shown under the free-text "Add as new keyword" button
    // — previously the API silently failed and the user had no feedback.
    const [addError, setAddError] = useState<string>("");
    const [addingCustom, setAddingCustom] = useState(false);

    // Hydrate display labels for already-selected keywords on mount.
    useEffect(() => {
        const all = [...primary, ...secondary];
        if (all.length === 0) return;
        (async () => {
            const { data } = await sb
                .from("gov_keywords")
                .select("keyword, display_label")
                .in("keyword", all);
            if (!data) return;
            const next = new Map(labels);
            for (const row of data as { keyword: string; display_label: string }[]) {
                next.set(row.keyword, row.display_label);
            }
            setLabels(next);
        })();
        // run once per mount; selections rarely load from scratch
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced typeahead against gov_keywords. Search matches keyword, display_label,
    // or any alias (via the GIN index on aliases).
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        searchTimer.current = setTimeout(async () => {
            setLoading(true);
            // Case-insensitive substring match on keyword OR display_label.
            // Aliases filter added as a secondary query, union'd client-side.
            const like = `%${q.replace(/%/g, "")}%`;
            const [mainRes, aliasRes] = await Promise.all([
                sb.from("gov_keywords")
                    .select("keyword, display_label, category, aliases, frequency, title_frequency")
                    .or(`keyword.ilike.${like},display_label.ilike.${like}`)
                    .order("title_frequency", { ascending: false })
                    .limit(30),
                sb.from("gov_keywords")
                    .select("keyword, display_label, category, aliases, frequency, title_frequency")
                    .contains("aliases", [q.toLowerCase()])
                    .limit(5),
            ]);
            const seen = new Set<string>();
            const merged: GovKeyword[] = [];
            for (const row of [...(mainRes.data || []), ...(aliasRes.data || [])] as GovKeyword[]) {
                if (seen.has(row.keyword)) continue;
                seen.add(row.keyword);
                merged.push(row);
            }
            setResults(merged.slice(0, 30));
            setLoading(false);
        }, 300);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [query, sb]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const allSelected = useMemo(() => new Set([...primary, ...secondary]), [primary, secondary]);

    const add = useCallback((row: GovKeyword) => {
        if (allSelected.has(row.keyword)) return;
        setLabels(prev => {
            const next = new Map(prev);
            next.set(row.keyword, row.display_label);
            return next;
        });
        // Auto-select bucket if chosen mode is full.
        const wantPrimary = mode === "primary" && primary.length < maxPrimary;
        const wantSecondary = mode === "secondary" && secondary.length < maxSecondary;
        if (wantPrimary) {
            onChange([...primary, row.keyword], secondary);
        } else if (wantSecondary) {
            onChange(primary, [...secondary, row.keyword]);
        } else if (primary.length < maxPrimary) {
            onChange([...primary, row.keyword], secondary);
            setMode("primary");
        } else if (secondary.length < maxSecondary) {
            onChange(primary, [...secondary, row.keyword]);
            setMode("secondary");
        }
        // If both full, ignore.
        setQuery("");
        setResults([]);
    }, [allSelected, mode, primary, secondary, maxPrimary, maxSecondary, onChange]);

    const remove = (kw: string, from: "primary" | "secondary") => {
        if (from === "primary") {
            onChange(primary.filter(k => k !== kw), secondary);
        } else {
            onChange(primary, secondary.filter(k => k !== kw));
        }
    };

    const moveToOther = (kw: string, from: "primary" | "secondary") => {
        if (from === "primary") {
            if (secondary.length >= maxSecondary) return;
            onChange(primary.filter(k => k !== kw), [...secondary, kw]);
        } else {
            if (primary.length >= maxPrimary) return;
            onChange([...primary, kw], secondary.filter(k => k !== kw));
        }
    };

    const [dragOver, setDragOver] = useState<"primary" | "secondary" | null>(null);

    // HTML5 drag-drop to move a chip between primary/secondary. The ↔ button
    // stays as a keyboard-accessible fallback; drag is pure mouse-sugar.
    const handleDragStart = (kw: string, from: "primary" | "secondary") => (e: React.DragEvent) => {
        e.dataTransfer.setData("application/x-kwp", JSON.stringify({ kw, from }));
        e.dataTransfer.effectAllowed = "move";
    };
    const handleDropOn = (bucket: "primary" | "secondary") => (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const raw = e.dataTransfer.getData("application/x-kwp");
        if (!raw) return;
        try {
            const { kw, from } = JSON.parse(raw) as { kw: string; from: "primary" | "secondary" };
            if (from === bucket) return;   // already there
            moveToOther(kw, from);
        } catch { /* ignore */ }
    };
    const handleDragOver = (bucket: "primary" | "secondary") => (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("application/x-kwp")) {
            e.preventDefault();
            setDragOver(bucket);
        }
    };

    const renderChip = (kw: string, bucket: "primary" | "secondary") => {
        const label = labels.get(kw) || kw;
        const isPrimary = bucket === "primary";
        return (
            <span
                key={kw}
                draggable
                onDragStart={handleDragStart(kw, bucket)}
                className={clsx(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs cursor-grab active:cursor-grabbing select-none",
                    isPrimary
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-stone-50 border-stone-200 text-stone-700",
                )}
                title={`${kw} — drag to the other bucket, or use the arrows`}
            >
                <GripVertical className="w-3 h-3 text-stone-400" />
                {label}
                <button
                    type="button"
                    onClick={() => moveToOther(kw, bucket)}
                    className="text-stone-400 hover:text-stone-700"
                    title={isPrimary ? "Move to secondary" : "Move to primary"}
                >
                    ↔
                </button>
                <button
                    type="button"
                    onClick={() => remove(kw, bucket)}
                    className="text-stone-400 hover:text-rose-600"
                    title="Remove"
                >
                    <X className="w-3 h-3" />
                </button>
            </span>
        );
    };

    const suggestionRows = useMemo(() => {
        return suggestions.filter(s => !allSelected.has(s)).slice(0, 8);
    }, [suggestions, allSelected]);

    const bothFull = primary.length >= maxPrimary && secondary.length >= maxSecondary;

    return (
        <div ref={wrapRef} className="space-y-3">
            {/* Primary bucket */}
            <div>
                <div className="flex items-center justify-between text-xs font-medium text-stone-700 mb-1.5">
                    <span>Primary keywords
                        <span className="ml-1 font-normal text-stone-400">
                            ({primary.length}/{maxPrimary}) — strongest capability signals
                        </span>
                    </span>
                </div>
                <div
                    onDragOver={handleDragOver("primary")}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={handleDropOn("primary")}
                    className={clsx(
                        "min-h-[44px] rounded-xl border-2 px-2 py-1.5 flex flex-wrap gap-1.5 transition-colors",
                        dragOver === "primary"
                            ? "border-dashed border-emerald-500 bg-emerald-50"
                            : "border-stone-200 bg-stone-50",
                    )}
                >
                    {primary.length === 0 && (
                        <span className="text-xs text-stone-400 py-1">Drop chips here or pick from the search below.</span>
                    )}
                    {primary.map(kw => renderChip(kw, "primary"))}
                </div>
            </div>

            {/* Secondary bucket */}
            <div>
                <div className="flex items-center justify-between text-xs font-medium text-stone-700 mb-1.5">
                    <span>Secondary keywords
                        <span className="ml-1 font-normal text-stone-400">
                            ({secondary.length}/{maxSecondary}) — refinement signals
                        </span>
                    </span>
                </div>
                <div
                    onDragOver={handleDragOver("secondary")}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={handleDropOn("secondary")}
                    className={clsx(
                        "min-h-[44px] rounded-xl border-2 px-2 py-1.5 flex flex-wrap gap-1.5 transition-colors",
                        dragOver === "secondary"
                            ? "border-dashed border-stone-700 bg-stone-100"
                            : "border-stone-200 bg-stone-50",
                    )}
                >
                    {secondary.length === 0 && (
                        <span className="text-xs text-stone-400 py-1">Drop chips here or pick from the search below.</span>
                    )}
                    {secondary.map(kw => renderChip(kw, "secondary"))}
                </div>
            </div>

            {/* Search input */}
            {!bothFull && (
                <div className="relative">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-medium text-stone-700">Add keyword to:</span>
                        <button
                            type="button"
                            onClick={() => setMode("primary")}
                            disabled={primary.length >= maxPrimary}
                            className={clsx(
                                "text-xs px-2.5 py-1 rounded-full border transition",
                                mode === "primary"
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50",
                                primary.length >= maxPrimary && "opacity-40 cursor-not-allowed",
                            )}
                        >Primary</button>
                        <button
                            type="button"
                            onClick={() => setMode("secondary")}
                            disabled={secondary.length >= maxSecondary}
                            className={clsx(
                                "text-xs px-2.5 py-1 rounded-full border transition",
                                mode === "secondary"
                                    ? "bg-stone-900 text-white border-stone-900"
                                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50",
                                secondary.length >= maxSecondary && "opacity-40 cursor-not-allowed",
                            )}
                        >Secondary</button>
                    </div>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        placeholder='Search keywords — e.g. "body armor", "cybersecurity", "janitorial"'
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                    {open && (query.trim().length >= 2 || results.length > 0) && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
                            {loading && (
                                <div className="px-3 py-2 text-xs text-stone-500">Searching…</div>
                            )}
                            {results.map(r => {
                                const alreadyPicked = allSelected.has(r.keyword);
                                return (
                                    <button
                                        type="button"
                                        key={r.keyword}
                                        disabled={alreadyPicked}
                                        onClick={() => add(r)}
                                        className={clsx(
                                            "w-full text-left px-3 py-2 text-xs flex items-center gap-2 border-b border-stone-50 last:border-0",
                                            alreadyPicked ? "bg-stone-100 text-stone-400 cursor-not-allowed" : "hover:bg-stone-50",
                                        )}
                                    >
                                        <Plus className="w-3 h-3 flex-shrink-0 text-stone-400" />
                                        <span className="font-medium truncate">{r.display_label}</span>
                                        {r.category && (
                                            <span className="ml-auto flex-shrink-0 text-[10px] uppercase tracking-wide text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">
                                                {r.category}
                                            </span>
                                        )}
                                        <span className="flex-shrink-0 text-[10px] text-stone-400">
                                            {r.title_frequency}t / {r.frequency}
                                        </span>
                                    </button>
                                );
                            })}
                            {!loading && query.trim().length >= 2 && (
                                <button
                                    type="button"
                                    disabled={addingCustom}
                                    onClick={async () => {
                                        setAddError("");
                                        setAddingCustom(true);
                                        const term = query
                                            .toLowerCase()
                                            .trim()
                                            .replace(/\s+/g, " ");
                                        try {
                                            const res = await fetch("/api/keywords/add", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ keyword: term }),
                                            });
                                            const data = await res.json() as { keyword?: GovKeyword; error?: string };
                                            if (!res.ok || !data.keyword) {
                                                setAddError(data.error || `Couldn't add keyword (${res.status})`);
                                            } else {
                                                add(data.keyword);
                                            }
                                        } catch (e) {
                                            setAddError((e as Error).message || "Network error");
                                        } finally {
                                            setAddingCustom(false);
                                        }
                                    }}
                                    className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-t border-emerald-200 disabled:opacity-50"
                                >
                                    <Plus className="w-3 h-3 flex-shrink-0" />
                                    <span className="font-bold">
                                        {addingCustom ? "Adding…" : <>Add &ldquo;{query.trim()}&rdquo; as new keyword</>}
                                    </span>
                                    <span className="ml-auto text-[10px] opacity-70">
                                        {query.trim().includes(" ") ? "multi-word" : "saves to library"}
                                    </span>
                                </button>
                            )}
                            {addError && (
                                <div className="px-3 py-2 text-[11px] text-rose-700 bg-rose-50 border-t border-rose-200">
                                    {addError}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* AI suggestions strip (from Quick Checker crawl) */}
            {suggestionRows.length > 0 && !bothFull && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-900 mb-1.5">
                        <Sparkles className="w-3 h-3" /> Suggested from your website
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestionRows.map(kw => (
                            <button
                                key={kw}
                                type="button"
                                onClick={async () => {
                                    // Look up the library row so we pick up category/aliases/label.
                                    const { data } = await sb
                                        .from("gov_keywords")
                                        .select("keyword, display_label, category, aliases, frequency, title_frequency")
                                        .eq("keyword", kw)
                                        .maybeSingle();
                                    if (data) add(data as GovKeyword);
                                }}
                                className="text-xs bg-white border border-amber-300 text-amber-900 rounded-full px-2.5 py-1 hover:bg-amber-100"
                            >
                                + {labels.get(kw) || kw}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
