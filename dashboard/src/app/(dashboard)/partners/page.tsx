// @ts-nocheck
"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Users, Search, Loader2, Shield, Globe, MapPin, X, ChevronDown, Handshake, Plus, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";

const supabase = createSupabaseClient();

interface Partner {
    uei: string;
    cage_code: string;
    company_name: string;
    dba_name: string;
    state: string;
    city: string;
    naics_codes: string[];
    certifications: string[];
    website: string;
    sam_url: string;
}

const STATE_OPTIONS = [
    "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface SavedPartner {
    id: string;
    company_name: string;
    website: string | null;
    uei: string | null;
    naics_codes: string[];
    state: string | null;
    certifications: string[];
    status: "active" | "potential" | "archived";
}

export default function PartnersPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>}>
            <PartnersPageInner />
        </Suspense>
    );
}

function PartnersPageInner() {
    const searchParams = useSearchParams();
    // Sidebar flyout can deep-link to /partners?status=active or ?status=potential.
    // The parameter filters the Saved Partners section (search results untouched).
    const statusFilter = (searchParams.get("status") as "active" | "potential" | null) || null;
    const [activeTab, setActiveTab] = useState<"search" | "saved">("search");
    const [naicsCodes, setNaicsCodes] = useState<string[]>([]);
    const [states, setStates] = useState<string[]>([]);
    const [cert, setCert] = useState("");
    const [keyword, setKeyword] = useState("");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<Partner[]>([]);
    const [searched, setSearched] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [savedPartners, setSavedPartners] = useState<SavedPartner[]>([]);
    const [savedUEIs, setSavedUEIs] = useState<Set<string>>(new Set());
    const [savingUEI, setSavingUEI] = useState<string | null>(null);

    const loadSaved = async () => {
        const res = await fetch("/api/partners/save");
        if (!res.ok) return;
        const body = await res.json() as { partners: SavedPartner[] };
        setSavedPartners(body.partners || []);
        setSavedUEIs(new Set(body.partners.filter(p => p.uei).map(p => p.uei as string)));
    };

    useEffect(() => { loadSaved(); }, []);

    const savePartner = async (p: Partner, status: "active" | "potential") => {
        setSavingUEI(p.uei);
        const res = await fetch("/api/partners/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                company_name: p.company_name,
                website: p.website || null,
                uei: p.uei || null,
                naics_codes: p.naics_codes || [],
                state: p.state || null,
                certifications: p.certifications || [],
                status,
            }),
        });
        if (res.ok) {
            if (p.uei) setSavedUEIs(prev => new Set(prev).add(p.uei));
            loadSaved();
        }
        setSavingUEI(null);
    };

    // NAICS picker
    const [naicsQuery, setNaicsQuery] = useState("");
    const [naicsOpen, setNaicsOpen] = useState(false);
    const naicsRef = useRef<HTMLDivElement>(null);

    // State picker
    const [stateOpen, setStateOpen] = useState(false);
    const stateRef = useRef<HTMLDivElement>(null);
    const [stateQuery, setStateQuery] = useState("");

    // Pre-fill from user's profile
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from("user_profiles")
                .select("naics_codes, target_states, state")
                .eq("auth_user_id", user.id)
                .single();
            if (data?.naics_codes?.length) setNaicsCodes(data.naics_codes.slice(0, 3));
            if (data?.target_states?.length) setStates(data.target_states.slice(0, 5));
            else if (data?.state) setStates([data.state]);
        })();
    }, []);

    // Close pickers on outside click
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

    const toggleNaics = (code: string) => {
        setNaicsCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    };

    const toggleState = (st: string) => {
        setStates(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]);
    };

    const handleSearch = async () => {
        if (naicsCodes.length === 0 && !keyword.trim()) return;
        setSearching(true);
        setErrorMsg(null);
        const params = new URLSearchParams();
        for (const n of naicsCodes) params.append("naics", n);
        for (const s of states) params.append("state", s);
        if (cert) params.set("set_aside", cert);
        if (keyword.trim()) params.set("keyword", keyword.trim());
        params.set("limit", "50");

        try {
            const res = await fetch(`/api/partners/search?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || data.error) {
                setErrorMsg(
                    data.error
                        ? `${data.error}${data.upstream_errors?.length ? ` — ${data.upstream_errors[0]}` : ""}`
                        : `Search failed (HTTP ${res.status})`
                );
                setResults([]);
            } else {
                setResults(data.partners || []);
                if (data.upstream_errors?.length) {
                    setErrorMsg(`Partial results: ${data.upstream_errors[0]}`);
                }
            }
        } catch (err) {
            setErrorMsg(`Network error: ${(err as Error).message}`);
            setResults([]);
        }
        setSearched(true);
        setSearching(false);
    };

    // Debounced auto-search when the company-name keyword changes
    useEffect(() => {
        if (!keyword.trim() || keyword.trim().length < 3) return;
        const t = setTimeout(() => handleSearch(), 500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyword]);

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-12">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Users className="w-6 h-6" /> Find Teaming Partners
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Search SAM.gov for registered companies to team with on government contracts.
                </p>
            </div>

            {/* Search Form */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* NAICS multiselect dropdown */}
                    <div ref={naicsRef} className="relative">
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">NAICS Codes</label>
                        <button
                            type="button"
                            onClick={() => setNaicsOpen(v => !v)}
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-left flex items-center justify-between min-h-[38px] hover:border-stone-400"
                        >
                            <span className="truncate">
                                {naicsCodes.length === 0
                                    ? <span className="text-stone-400">Select NAICS codes...</span>
                                    : <span>{naicsCodes.length} selected</span>}
                            </span>
                            <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform flex-shrink-0 ml-2", naicsOpen && "rotate-180")} />
                        </button>
                        {naicsCodes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {naicsCodes.map(c => (
                                    <span key={c} className="inline-flex items-center bg-black text-white text-[10px] font-mono px-2 py-0.5 rounded-full">
                                        {c}
                                        <button type="button" onClick={() => toggleNaics(c)} className="ml-1.5 hover:text-red-300" title={`Remove ${c}`}>
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {naicsOpen && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-80 overflow-hidden flex flex-col">
                                <div className="p-2 border-b border-stone-100">
                                    <input
                                        autoFocus
                                        type="text"
                                        value={naicsQuery}
                                        onChange={(e) => setNaicsQuery(e.target.value)}
                                        placeholder="Search by code or keyword (IT, janitorial, HVAC…)"
                                        className="w-full border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    />
                                </div>
                                <div className="overflow-y-auto flex-1">
                                    {filteredNaics.length === 0 ? (
                                        <p className="text-xs text-stone-400 p-4 text-center">No matches</p>
                                    ) : (
                                        filteredNaics.map(n => (
                                            <button
                                                type="button"
                                                key={n.code}
                                                onClick={() => toggleNaics(n.code)}
                                                className={clsx(
                                                    "w-full text-left px-3 py-2 text-sm hover:bg-stone-50 flex items-center gap-2 border-b border-stone-50 last:border-0",
                                                    naicsCodes.includes(n.code) && "bg-emerald-50",
                                                )}
                                            >
                                                <span className="font-mono text-xs text-stone-500 flex-shrink-0">{n.code}</span>
                                                <span className="text-xs truncate">{n.label}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* State multiselect */}
                    <div ref={stateRef} className="relative">
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">States</label>
                        <button
                            type="button"
                            onClick={() => setStateOpen(v => !v)}
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-left flex items-center justify-between min-h-[38px] hover:border-stone-400"
                        >
                            <span className="truncate">
                                {states.length === 0
                                    ? <span className="text-stone-400">Any state</span>
                                    : states.length === STATE_OPTIONS.length
                                        ? <span>Nationwide</span>
                                        : <span>{states.length} selected</span>}
                            </span>
                            <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform flex-shrink-0 ml-2", stateOpen && "rotate-180")} />
                        </button>
                        {states.length > 0 && states.length < STATE_OPTIONS.length && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {states.map(s => (
                                    <span key={s} className="inline-flex items-center bg-black text-white text-[10px] font-mono px-2 py-0.5 rounded-full">
                                        {s}
                                        <button type="button" onClick={() => toggleState(s)} className="ml-1.5 hover:text-red-300" title={`Remove ${s}`}>
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {stateOpen && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-80 overflow-hidden flex flex-col">
                                <div className="p-2 border-b border-stone-100 flex items-center gap-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        value={stateQuery}
                                        onChange={(e) => setStateQuery(e.target.value.toUpperCase())}
                                        placeholder="e.g. TX"
                                        className="flex-1 border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10 font-mono uppercase"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setStates(states.length === STATE_OPTIONS.length ? [] : [...STATE_OPTIONS])}
                                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded bg-stone-100 hover:bg-stone-200"
                                    >
                                        {states.length === STATE_OPTIONS.length ? "Clear" : "All"}
                                    </button>
                                </div>
                                <div className="overflow-y-auto flex-1 grid grid-cols-4 sm:grid-cols-6 gap-1 p-2">
                                    {filteredStates.map(s => (
                                        <button
                                            type="button"
                                            key={s}
                                            onClick={() => toggleState(s)}
                                            className={clsx(
                                                "text-xs font-mono font-bold px-2 py-1.5 rounded border transition-all",
                                                states.includes(s)
                                                    ? "bg-black text-white border-black"
                                                    : "bg-white text-stone-600 border-stone-200 hover:border-stone-400",
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">Certification</label>
                        <select title="Certification" value={cert} onChange={e => setCert(e.target.value)}
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm bg-white">
                            <option value="">Any</option>
                            <option value="8A">8(a)</option>
                            <option value="SDVOSB">SDVOSB (Veteran)</option>
                            <option value="WOSB">WOSB (Women)</option>
                            <option value="HUBZONE">HUBZone</option>
                            <option value="VOSB">VOSB</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">Company Name</label>
                        <div className="relative">
                            <input
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                                placeholder="Search by name (autosearches after 3 chars)"
                                className="w-full border border-stone-300 rounded-xl pl-3 pr-8 py-2 text-sm"
                            />
                            {searching && keyword && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-stone-400" />}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching || (naicsCodes.length === 0 && !keyword.trim())}
                    className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-stone-800"
                >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {searching ? "Searching SAM.gov..." : "Search Partners"}
                </button>
            </div>

            {/* Upstream error banner */}
            {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-red-700 mb-0.5">SAM.gov partner search issue</p>
                    <p className="text-xs text-red-600 break-words">{errorMsg}</p>
                </div>
            )}

            {/* Results */}
            {searched && !errorMsg && results.length === 0 && !searching && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">No partners found. Try different search criteria.</p>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm text-stone-500">{results.length} partners found</p>
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {results.map((p, i) => (
                        <div key={p.uei || i} className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-sm text-black">{p.company_name}</h3>
                                    {p.dba_name && <p className="text-xs text-stone-400">DBA: {p.dba_name}</p>}
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        {p.state && <span className="text-xs text-stone-500 inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.city ? `${p.city}, ${p.state}` : p.state}</span>}
                                        {p.uei && <span className="text-[10px] font-mono text-stone-400">UEI: {p.uei}</span>}
                                        {p.cage_code && <span className="text-[10px] font-mono text-stone-400">CAGE: {p.cage_code}</span>}
                                    </div>
                                    {p.certifications.length > 0 && (
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {p.certifications.map((c, j) => (
                                                <span key={j} className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">{c}</span>
                                            ))}
                                        </div>
                                    )}
                                    {p.naics_codes.length > 0 && (
                                        <div className="flex gap-1 mt-1.5 flex-wrap">
                                            {p.naics_codes.slice(0, 5).map((n, j) => (
                                                <span key={j} className="text-[9px] font-mono bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">{n}</span>
                                            ))}
                                            {p.naics_codes.length > 5 && <span className="text-[9px] text-stone-400">+{p.naics_codes.length - 5}</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                    <a href={p.sam_url} target="_blank" rel="noopener noreferrer"
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                        <Shield className="w-3 h-3" /> SAM.gov
                                    </a>
                                    {p.website && (
                                        <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer"
                                            className="text-xs font-bold text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                                            <Globe className="w-3 h-3" /> Website
                                        </a>
                                    )}
                                    {p.uei && savedUEIs.has(p.uei) ? (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Saved
                                        </span>
                                    ) : (
                                        <button type="button" disabled={savingUEI === p.uei} onClick={() => savePartner(p, "potential")}
                                            className="text-[10px] font-bold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 px-2 py-0.5 rounded inline-flex items-center gap-1 disabled:opacity-50">
                                            <Plus className="w-3 h-3" /> {savingUEI === p.uei ? "Saving…" : "Save"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
            )}

            {/* Saved partners section */}
            {savedPartners.length > 0 && (
                <div className="mt-10">
                    <h3 className="text-lg font-bold tracking-tight text-black mb-3 flex items-center gap-2">
                        <Handshake className="w-5 h-5 text-emerald-600" />
                        {statusFilter === "active" ? "Active Partners" : statusFilter === "potential" ? "Potential Partners" : "Your Partners"}
                        <span className="text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                            {statusFilter ? savedPartners.filter(p => p.status === statusFilter).length : savedPartners.length}
                        </span>
                        {statusFilter && (
                            <Link href="/partners" className="ml-2 text-[11px] text-stone-500 hover:text-black underline">Show all</Link>
                        )}
                    </h3>
                    {(["active", "potential"] as const).filter(s => !statusFilter || statusFilter === s).map(status => {
                        const group = savedPartners.filter(p => p.status === status);
                        if (group.length === 0) return null;
                        return (
                            <div key={status} className="mb-6">
                                <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                                    {status === "active" ? "Active Partners" : "Potential Partners"} · {group.length}
                                </h4>
                                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                                    {group.map(p => (
                                        <Link key={p.id} href={`/partners/${p.id}`}
                                            className={clsx(
                                                "block bg-white border rounded-2xl p-4 hover:border-stone-400 transition-colors",
                                                status === "active" ? "border-emerald-200" : "border-stone-200",
                                            )}>
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <h5 className="font-bold text-sm text-black">{p.company_name}</h5>
                                                <span className={clsx(
                                                    "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border flex-shrink-0",
                                                    status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200",
                                                )}>{status}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap text-xs text-stone-500">
                                                {p.state && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.state}</span>}
                                                {p.uei && <span className="text-[10px] font-mono text-stone-400">UEI: {p.uei}</span>}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
