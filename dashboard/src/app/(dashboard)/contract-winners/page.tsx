"use client";

import { useEffect, useState } from "react";
import {
    Award, Loader2, Search, X, Filter, RefreshCw, ChevronDown,
} from "lucide-react";
import { ContractorListCard, type ContractorRow } from "@/components/ContractorListCard";
import clsx from "clsx";

const STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const CERTS = ["8(a)", "HUBZone", "SDVOSB", "WOSB", "VOSB", "SDB"];

type SortKey = "awards" | "value" | "recent";

export default function ContractWinnersPage() {
    const [rows, setRows] = useState<ContractorRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [keyword, setKeyword] = useState("");
    const [naics, setNaics] = useState<string[]>([]);
    const [naicsInput, setNaicsInput] = useState("");
    const [states, setStates] = useState<string[]>([]);
    const [certs, setCerts] = useState<string[]>([]);
    const [sort, setSort] = useState<SortKey>("awards");
    const [onlyAwards, setOnlyAwards] = useState(true);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [offset, setOffset] = useState(0);
    const PAGE_SIZE = 50;

    async function fetchData(reset = false) {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            for (const n of naics) params.append("naics", n);
            for (const s of states) params.append("state", s);
            for (const c of certs) params.append("cert", c);
            if (keyword) params.set("keyword", keyword);
            params.set("sort", sort);
            params.set("only_awards", onlyAwards ? "true" : "false");
            params.set("limit", String(PAGE_SIZE));
            params.set("offset", String(reset ? 0 : offset));
            const res = await fetch(`/api/contractors/list?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (reset) setRows(json.contractors || []);
            else setRows(prev => [...prev, ...(json.contractors || [])]);
            setTotal(json.total ?? 0);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        setOffset(0);
        fetchData(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [naics.join(","), states.join(","), certs.join(","), sort, onlyAwards]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setOffset(0);
        fetchData(true);
    };

    const addNaics = () => {
        const code = naicsInput.trim();
        if (code && !naics.includes(code)) setNaics([...naics, code]);
        setNaicsInput("");
    };

    return (
        <div className="mx-auto max-w-6xl px-6 py-8">
            <header className="mb-6">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">
                    <Award className="w-4 h-4" /> Past-Performance Database
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-stone-900">Contract Winners</h1>
                <p className="text-sm text-stone-600 mt-1">
                    Federal contractors with confirmed past performance — the highest-quality partnership leads.
                    Cross-referenced from SAM.gov registration + USASpending award history.
                </p>
            </header>

            {/* Filter strip */}
            <form onSubmit={handleSearch} className="mb-4 bg-white border border-stone-200 rounded-2xl p-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                            type="text"
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder="Search company name…"
                            className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <button type="submit" className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700">
                        Search
                    </button>
                    <button
                        type="button"
                        onClick={() => setFiltersOpen(v => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-stone-200 rounded-lg hover:bg-stone-50"
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filters
                        {(naics.length + states.length + certs.length) > 0 && (
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-bold">
                                {naics.length + states.length + certs.length}
                            </span>
                        )}
                        <ChevronDown className={clsx("w-3 h-3 transition-transform", filtersOpen && "rotate-180")} />
                    </button>
                </div>

                {filtersOpen && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-stone-100">
                        {/* NAICS */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wide text-stone-500">NAICS</label>
                            <div className="flex gap-1 mt-1">
                                <input
                                    value={naicsInput}
                                    onChange={e => setNaicsInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addNaics())}
                                    placeholder="6-digit"
                                    className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded"
                                />
                                <button type="button" onClick={addNaics}
                                    className="px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 rounded">+</button>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {naics.map((n, i) => (
                                    <span key={i} className="text-[10px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                        {n}
                                        <button onClick={() => setNaics(naics.filter(x => x !== n))} type="button"><X className="w-2.5 h-2.5" /></button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* State multi-select */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wide text-stone-500">State</label>
                            <select
                                multiple
                                value={states}
                                onChange={e => setStates(Array.from(e.target.selectedOptions).map(o => o.value))}
                                className="w-full mt-1 px-2 py-1 text-xs border border-stone-200 rounded h-20"
                            >
                                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {/* Certifications */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Certifications</label>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {CERTS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setCerts(certs.includes(c) ? certs.filter(x => x !== c) : [...certs, c])}
                                        className={clsx(
                                            "text-[10px] font-bold px-2 py-0.5 rounded border",
                                            certs.includes(c) ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-white text-stone-500 border-stone-200 hover:border-stone-300",
                                        )}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                    <label className="inline-flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                        <input type="checkbox" checked={onlyAwards} onChange={e => setOnlyAwards(e.target.checked)} className="rounded" />
                        Only contractors with federal past awards
                    </label>
                    <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-stone-500">Sort by</span>
                        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
                            className="px-2 py-1 text-xs border border-stone-200 rounded">
                            <option value="awards">Most awards</option>
                            <option value="value">Highest volume ($)</option>
                            <option value="recent">Most recent award</option>
                        </select>
                    </div>
                </div>
            </form>

            {/* Results */}
            {error && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900">
                    {error}
                </div>
            )}

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-stone-500">
                            <span className="font-bold text-stone-900 tabular-nums">{total.toLocaleString()}</span> contractors
                            {onlyAwards && <span> with confirmed past performance</span>}
                        </div>
                        <button onClick={() => fetchData(true)} className="text-xs text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
                            <RefreshCw className={clsx("w-3 h-3", loading && "animate-spin")} /> Refresh
                        </button>
                    </div>

                    <div className="space-y-2">
                        {rows.map(c => <ContractorListCard key={c.uei} c={c} />)}
                    </div>

                    {rows.length < total && (
                        <div className="flex justify-center mt-4">
                            <button
                                onClick={() => { setOffset(rows.length); fetchData(false); }}
                                disabled={loading}
                                className="px-4 py-2 text-xs font-medium bg-white border border-stone-200 hover:bg-stone-50 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                Load {Math.min(PAGE_SIZE, total - rows.length)} more
                            </button>
                        </div>
                    )}

                    {rows.length === 0 && !loading && (
                        <div className="text-center py-12 text-sm text-stone-500">
                            <Award className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                            No contractors match these filters yet. Try relaxing filters or unchecking &ldquo;Only with awards&rdquo;.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
