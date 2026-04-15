"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Loader2, MapPin, Shield, CheckCircle2, Building2 } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";

interface SamPartner {
    uei: string;
    cage_code: string;
    company_name: string;
    dba_name: string;
    state: string;
    city: string;
    naics_codes: string[];
    primary_naics: string;
    certifications: string[];
    website: string;
    sam_url: string;
    entity_type: string;
}

const STATE_OPTIONS = [
    "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const MAX_SELECT = 20;

interface Props {
    open: boolean;
    onClose: () => void;
    onAdded: (count: number) => void;
    defaultNaics?: string[];
    defaultStates?: string[];
}

export default function BulkAddFromSam({ open, onClose, onAdded, defaultNaics = [], defaultStates = [] }: Props) {
    const [naicsCodes, setNaicsCodes] = useState<string[]>(defaultNaics);
    const [states, setStates] = useState<string[]>(defaultStates);
    const [keyword, setKeyword] = useState("");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<SamPartner[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [error, setError] = useState("");
    const [adding, setAdding] = useState(false);
    const [searched, setSearched] = useState(false);

    // NAICS dropdown
    const [naicsQuery, setNaicsQuery] = useState("");
    const [naicsOpen, setNaicsOpen] = useState(false);
    const naicsRef = useRef<HTMLDivElement>(null);

    // State dropdown
    const [stateOpen, setStateOpen] = useState(false);
    const [stateQuery, setStateQuery] = useState("");
    const stateRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setNaicsCodes(defaultNaics);
            setStates(defaultStates);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (naicsRef.current && !naicsRef.current.contains(e.target as Node)) setNaicsOpen(false);
            if (stateRef.current && !stateRef.current.contains(e.target as Node)) setStateOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const filteredNaics = useMemo(() => {
        if (!naicsQuery.trim()) return NAICS_CODES.filter(n => n.popular).slice(0, 30);
        return searchNaics(naicsQuery).slice(0, 50);
    }, [naicsQuery]);

    const filteredStates = useMemo(() => {
        const q = stateQuery.trim().toUpperCase();
        if (!q) return STATE_OPTIONS;
        return STATE_OPTIONS.filter(s => s.includes(q));
    }, [stateQuery]);

    function toggleNaics(code: string) {
        setNaicsCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    }
    function toggleState(s: string) {
        setStates(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    }

    async function runSearch() {
        setError("");
        if (naicsCodes.length === 0 && !keyword.trim()) {
            setError("Add at least one NAICS code or a keyword.");
            return;
        }
        setSearching(true);
        setResults([]);
        setSelected(new Set());
        try {
            const params = new URLSearchParams();
            naicsCodes.forEach(n => params.append("naics", n));
            states.forEach(s => params.append("state", s));
            if (keyword.trim()) params.set("keyword", keyword.trim());
            params.set("limit", "50");
            const res = await fetch(`/api/partners/search?${params.toString()}`);
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || `Search failed (${res.status})`);
            }
            const data = await res.json();
            setResults((data.partners || []) as SamPartner[]);
            setSearched(true);
        } catch (e) {
            setError((e as Error).message || "Search failed.");
        } finally {
            setSearching(false);
        }
    }

    function toggleSelectOne(uei: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(uei)) next.delete(uei);
            else {
                if (next.size >= MAX_SELECT) return prev;
                next.add(uei);
            }
            return next;
        });
    }

    function toggleSelectAll() {
        if (selected.size >= Math.min(results.length, MAX_SELECT)) {
            setSelected(new Set());
        } else {
            const next = new Set<string>();
            for (const r of results) {
                if (next.size >= MAX_SELECT) break;
                if (r.uei) next.add(r.uei);
            }
            setSelected(next);
        }
    }

    async function handleAdd() {
        if (selected.size === 0) return;
        setAdding(true);
        setError("");
        try {
            const chosen = results.filter(r => selected.has(r.uei));
            const res = await fetch("/api/competitors/add-from-sam", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ partners: chosen }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Add failed");
            onAdded(data.inserted || 0);
            onClose();
        } catch (e) {
            setError((e as Error).message || "Add failed");
        } finally {
            setAdding(false);
        }
    }

    if (!open) return null;

    const allSelectedCount = Math.min(results.length, MAX_SELECT);
    const isAllSelected = selected.size > 0 && selected.size === allSelectedCount;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4 flex flex-col max-h-[calc(100vh-4rem)]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-stone-200">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                            <h2 className="font-bold text-black">Bulk Add from SAM.gov</h2>
                            <p className="text-xs text-stone-500">Search registered entities and import as competitors</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search controls */}
                <div className="p-5 border-b border-stone-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* NAICS picker */}
                        <div className="relative" ref={naicsRef}>
                            <label className="text-[10px] text-stone-400 uppercase mb-1 block">NAICS Codes</label>
                            <button
                                type="button"
                                onClick={() => setNaicsOpen(v => !v)}
                                className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-white text-left hover:border-stone-300 flex items-center justify-between"
                            >
                                <span className={clsx(naicsCodes.length === 0 && "text-stone-400")}>
                                    {naicsCodes.length === 0 ? "Pick NAICS..." : `${naicsCodes.length} selected`}
                                </span>
                                <Search className="w-4 h-4 text-stone-400" />
                            </button>
                            {naicsOpen && (
                                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-72 overflow-hidden flex flex-col">
                                    <input
                                        autoFocus
                                        value={naicsQuery}
                                        onChange={(e) => setNaicsQuery(e.target.value)}
                                        placeholder="Search NAICS..."
                                        className="px-3 py-2 text-sm border-b border-stone-200 focus:outline-none"
                                    />
                                    <div className="overflow-y-auto flex-1">
                                        {filteredNaics.map(n => (
                                            <label key={n.code} className="flex items-start gap-2 px-3 py-2 hover:bg-stone-50 cursor-pointer text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={naicsCodes.includes(n.code)}
                                                    onChange={() => toggleNaics(n.code)}
                                                    className="mt-0.5"
                                                />
                                                <span className="font-mono text-stone-500">{n.code}</span>
                                                <span className="text-stone-700">{n.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {naicsCodes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {naicsCodes.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => toggleNaics(c)}
                                            className="text-[10px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded inline-flex items-center gap-1 hover:bg-emerald-100"
                                        >
                                            {c} <X className="w-2.5 h-2.5" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* State picker */}
                        <div className="relative" ref={stateRef}>
                            <label className="text-[10px] text-stone-400 uppercase mb-1 block">States</label>
                            <button
                                type="button"
                                onClick={() => setStateOpen(v => !v)}
                                className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-white text-left hover:border-stone-300 flex items-center justify-between"
                            >
                                <span className={clsx(states.length === 0 && "text-stone-400")}>
                                    {states.length === 0 ? "Any state" : `${states.length} selected`}
                                </span>
                                <MapPin className="w-4 h-4 text-stone-400" />
                            </button>
                            {stateOpen && (
                                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-64 overflow-hidden flex flex-col">
                                    <input
                                        autoFocus
                                        value={stateQuery}
                                        onChange={(e) => setStateQuery(e.target.value)}
                                        placeholder="Search state..."
                                        className="px-3 py-2 text-sm border-b border-stone-200 focus:outline-none uppercase"
                                    />
                                    <div className="overflow-y-auto flex-1 grid grid-cols-3 gap-0 p-1">
                                        {filteredStates.map(s => (
                                            <label key={s} className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-stone-50 cursor-pointer text-xs rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={states.includes(s)}
                                                    onChange={() => toggleState(s)}
                                                />
                                                <span className="font-mono">{s}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {states.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {states.map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => toggleState(s)}
                                            className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded inline-flex items-center gap-1 hover:bg-blue-100"
                                        >
                                            {s} <X className="w-2.5 h-2.5" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Keyword */}
                        <div>
                            <label className="text-[10px] text-stone-400 uppercase mb-1 block">Keyword (company name)</label>
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                                placeholder="e.g. environmental, acme"
                                className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <div className="ml-auto">
                            <button
                                type="button"
                                onClick={runSearch}
                                disabled={searching}
                                className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                            >
                                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                {searching ? "Searching..." : "Search SAM.gov"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto">
                    {searched && results.length === 0 && !searching && (
                        <div className="text-center py-12">
                            <p className="text-sm text-stone-500">No entities found. Try different filters.</p>
                        </div>
                    )}
                    {results.length > 0 && (
                        <>
                            <div className="sticky top-0 bg-stone-50 border-b border-stone-200 px-5 py-2.5 flex items-center justify-between text-xs z-10">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={toggleSelectAll}
                                    />
                                    <span className="font-medium text-stone-700">
                                        Select {results.length > MAX_SELECT ? `first ${MAX_SELECT}` : "all"}
                                    </span>
                                </label>
                                <span className="text-stone-500">
                                    {results.length} results · {selected.size}/{MAX_SELECT} selected
                                </span>
                            </div>
                            <div className="divide-y divide-stone-100">
                                {results.map(r => {
                                    const checked = selected.has(r.uei);
                                    const disabled = !checked && selected.size >= MAX_SELECT;
                                    return (
                                        <label
                                            key={r.uei}
                                            className={clsx(
                                                "flex items-start gap-3 px-5 py-3 cursor-pointer",
                                                checked ? "bg-emerald-50/40" : "hover:bg-stone-50",
                                                disabled && "opacity-50 cursor-not-allowed"
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={disabled}
                                                onChange={() => toggleSelectOne(r.uei)}
                                                className="mt-1"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-black">{r.company_name}</span>
                                                    {r.certifications.map(c => (
                                                        <span key={c} className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase bg-amber-50 text-amber-700 border-amber-200">
                                                            <Shield className="w-2.5 h-2.5 inline mr-0.5" />{c}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-500 flex-wrap">
                                                    <span className="font-mono text-[10px] text-stone-400">UEI: {r.uei}</span>
                                                    {(r.city || r.state) && (
                                                        <span>
                                                            <MapPin className="w-3 h-3 inline mr-0.5" />
                                                            {[r.city, r.state].filter(Boolean).join(", ")}
                                                        </span>
                                                    )}
                                                    {r.naics_codes.length > 0 && (
                                                        <span className="font-mono text-[10px]">
                                                            NAICS: {r.naics_codes.slice(0, 4).join(", ")}
                                                            {r.naics_codes.length > 4 && ` +${r.naics_codes.length - 4}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {checked && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-1" />}
                                        </label>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-stone-200 flex items-center justify-between bg-stone-50 rounded-b-2xl">
                    <span className="text-xs text-stone-500">Max {MAX_SELECT} per add</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={selected.size === 0 || adding}
                            className="px-5 py-2 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Add {selected.size > 0 ? `${selected.size} ` : ""}selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
