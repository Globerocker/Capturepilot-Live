// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Users, Search, Loader2, ExternalLink, Shield, Globe, MapPin } from "lucide-react";
import clsx from "clsx";

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

export default function PartnersPage() {
    const [naics, setNaics] = useState("");
    const [state, setState] = useState("");
    const [cert, setCert] = useState("");
    const [keyword, setKeyword] = useState("");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<Partner[]>([]);
    const [searched, setSearched] = useState(false);

    // Pre-fill from user's NAICS codes
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase.from("user_profiles").select("naics_codes, state").eq("auth_user_id", user.id).single();
            if (data?.naics_codes?.[0]) setNaics(data.naics_codes[0]);
        })();
    }, []);

    const handleSearch = async () => {
        if (!naics && !keyword) return;
        setSearching(true);
        const params = new URLSearchParams();
        if (naics) params.set("naics", naics);
        if (state) params.set("state", state);
        if (cert) params.set("set_aside", cert);
        if (keyword) params.set("keyword", keyword);
        params.set("limit", "30");

        const res = await fetch(`/api/partners/search?${params.toString()}`);
        const data = await res.json();
        setResults(data.partners || []);
        setSearched(true);
        setSearching(false);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold font-typewriter flex items-center gap-2">
                    <Users className="w-6 h-6" /> Find Teaming Partners
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Search SAM.gov for registered companies to team with on government contracts.
                </p>
            </div>

            {/* Search Form */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">NAICS Code</label>
                        <input value={naics} onChange={e => setNaics(e.target.value)} placeholder="e.g. 237110"
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">State</label>
                        <input value={state} onChange={e => setState(e.target.value)} placeholder="e.g. TX"
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Certification</label>
                        <select title="Certification" value={cert} onChange={e => setCert(e.target.value)}
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm">
                            <option value="">Any</option>
                            <option value="8A">8(a)</option>
                            <option value="SDVOSB">SDVOSB (Veteran)</option>
                            <option value="WOSB">WOSB (Women)</option>
                            <option value="HUBZONE">HUBZone</option>
                            <option value="VOSB">VOSB</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Company Name</label>
                        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Search by name"
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                    </div>
                </div>
                <button type="button" onClick={handleSearch} disabled={searching || (!naics && !keyword)}
                    className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-stone-800">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {searching ? "Searching SAM.gov..." : "Search Partners"}
                </button>
            </div>

            {/* Results */}
            {searched && results.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">No partners found. Try different search criteria.</p>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm text-stone-500">{results.length} partners found</p>
                    {results.map((p, i) => (
                        <div key={i} className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors">
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
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
