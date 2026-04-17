"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Award, Loader2, MapPin, Plus, Search, Shield, X, CheckCircle2, ChevronDown, Mail, Phone, Building2,
} from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";

interface TribalContractor {
    uei: string;
    cage_code: string | null;
    business_name: string;
    primary_naics_code: string | null;
    all_naics_codes: string[];
    small_naics_codes: string[];
    certifications: string[];
    contact_name: string | null;
    contact_email: string | null;
    city: string | null;
    state: string | null;
    capabilities_narrative: string | null;
    capabilities_statement_url: string | null;
    sba_profile_url: string | null;
    naics_overlap?: number;
}

interface SaveFn {
    (p: {
        company_name: string;
        website: string | null;
        uei: string | null;
        naics_codes: string[];
        state: string | null;
        certifications: string[];
    }, status: "active" | "potential"): Promise<void>;
}

const CERT_OPTIONS = ["8(a)", "HUBZone", "WOSB", "EDWOSB", "VOSB", "SDVOSB", "8(a) JV"];

export function TribalPartnersPanel({
    profileNaics,
    savedUEIs,
    savingUEI,
    onSave,
}: {
    profileNaics: string[];
    savedUEIs: Set<string>;
    savingUEI: string | null;
    onSave: SaveFn;
}) {
    const [naicsCodes, setNaicsCodes] = useState<string[]>([]);
    const [certs, setCerts] = useState<string[]>([]);
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<TribalContractor[]>([]);
    const [searched, setSearched] = useState(false);
    const [rankedByProfile, setRankedByProfile] = useState(false);

    const [naicsOpen, setNaicsOpen] = useState(false);
    const [naicsQuery, setNaicsQuery] = useState("");
    const naicsRef = useRef<HTMLDivElement>(null);

    // Seed from profile on mount so the panel is useful without any clicks.
    useEffect(() => {
        if (profileNaics.length && naicsCodes.length === 0) setNaicsCodes(profileNaics.slice(0, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileNaics.join(",")]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (naicsRef.current && !naicsRef.current.contains(e.target as Node)) setNaicsOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const filteredNaics = useMemo(() => {
        if (!naicsQuery.trim()) return NAICS_CODES.filter(n => n.popular).slice(0, 30);
        return searchNaics(naicsQuery).slice(0, 50);
    }, [naicsQuery]);

    const toggleNaics = (code: string) =>
        setNaicsCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    const toggleCert = (c: string) =>
        setCerts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

    const runSearch = async () => {
        setLoading(true);
        const params = new URLSearchParams();
        for (const n of naicsCodes) params.append("naics", n);
        for (const c of certs) params.append("cert", c);
        if (keyword.trim()) params.set("keyword", keyword.trim());
        params.set("limit", "60");

        const res = await fetch(`/api/partners/tribal?${params.toString()}`);
        const body = await res.json().catch(() => ({ partners: [] }));
        setResults(body.partners || []);
        setRankedByProfile(!!body.ranked_by_profile);
        setSearched(true);
        setLoading(false);
    };

    // Debounce on keyword changes. Fires an initial load on mount too (empty filters is fine — returns profile-ranked directory).
    useEffect(() => {
        const t = setTimeout(() => runSearch(), keyword ? 400 : 0);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [naicsCodes.join(","), certs.join(","), keyword]);

    return (
        <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="text-xs text-emerald-900">
                    <strong>Curated directory</strong> of ~800 SBA-certified 8(a), HUBZone, WOSB, and tribal-owned firms with
                    verified capability statements. Results rank by NAICS overlap with your profile — sole-source eligible
                    primes bubble to the top.
                </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* NAICS */}
                    <div ref={naicsRef} className="relative">
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">NAICS Codes</label>
                        <button
                            type="button"
                            onClick={() => setNaicsOpen(v => !v)}
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-left flex items-center justify-between min-h-[38px] hover:border-stone-400"
                        >
                            <span className="truncate">
                                {naicsCodes.length === 0
                                    ? <span className="text-stone-400">Filter by NAICS (optional)</span>
                                    : <span>{naicsCodes.length} selected</span>}
                            </span>
                            <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform", naicsOpen && "rotate-180")} />
                        </button>
                        {naicsCodes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {naicsCodes.map(c => (
                                    <span key={c} className="inline-flex items-center bg-black text-white text-[10px] font-mono px-2 py-0.5 rounded-full">
                                        {c}
                                        <button type="button" onClick={() => toggleNaics(c)} className="ml-1.5 hover:text-red-300">
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
                                        placeholder="Search by code or keyword"
                                        className="w-full border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    />
                                </div>
                                <div className="overflow-y-auto flex-1">
                                    {filteredNaics.map(n => (
                                        <button
                                            type="button"
                                            key={n.code}
                                            onClick={() => toggleNaics(n.code)}
                                            className={clsx(
                                                "w-full text-left px-3 py-2 text-sm hover:bg-stone-50 flex items-center gap-2 border-b border-stone-50 last:border-0",
                                                naicsCodes.includes(n.code) && "bg-emerald-50",
                                            )}
                                        >
                                            <span className="font-mono text-xs text-stone-500">{n.code}</span>
                                            <span className="text-xs truncate">{n.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Keyword */}
                    <div>
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">Company Name</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                placeholder="Search firm names"
                                className="w-full border border-stone-300 rounded-xl pl-3 pr-8 py-2 text-sm"
                            />
                            {loading && keyword && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-stone-400" />}
                        </div>
                    </div>
                </div>

                {/* Cert chips */}
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1.5">Certifications</label>
                    <div className="flex gap-1.5 flex-wrap">
                        {CERT_OPTIONS.map(c => {
                            const active = certs.includes(c);
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => toggleCert(c)}
                                    className={clsx(
                                        "text-xs px-2.5 py-1 rounded-full border font-medium",
                                        active
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-300 hover:border-stone-500"
                                    )}
                                >
                                    {c}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Results */}
            {loading && results.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-400 mx-auto mb-2" />
                    <p className="text-xs text-stone-500">Ranking teaming partners…</p>
                </div>
            )}

            {searched && !loading && results.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-sm text-stone-500">No certified firms matched these filters. Try broadening NAICS or removing cert filters.</p>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm text-stone-500">
                        {results.length} certified firms
                        {rankedByProfile && <span className="ml-2 text-emerald-700">· ranked by your profile NAICS overlap</span>}
                    </p>
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                        {results.map(p => (
                            <TribalCard
                                key={p.uei}
                                p={p}
                                saved={savedUEIs.has(p.uei)}
                                saving={savingUEI === p.uei}
                                onSave={onSave}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function TribalCard({
    p, saved, saving, onSave,
}: {
    p: TribalContractor;
    saved: boolean;
    saving: boolean;
    onSave: SaveFn;
}) {
    const displayNaics = p.all_naics_codes.slice(0, 5);
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
                        <h3 className="font-bold text-sm text-black leading-tight">{p.business_name}</h3>
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {p.state && <span className="text-xs text-stone-500 inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.city ? `${p.city}, ${p.state}` : p.state}</span>}
                        <span className="text-[10px] font-mono text-stone-400">UEI: {p.uei}</span>
                        {p.cage_code && <span className="text-[10px] font-mono text-stone-400">CAGE: {p.cage_code}</span>}
                        {typeof p.naics_overlap === "number" && p.naics_overlap > 0 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                <Award className="w-3 h-3" /> {p.naics_overlap} NAICS match
                            </span>
                        )}
                    </div>
                    {p.certifications.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                            {p.certifications.map((c, j) => (
                                <span key={j} className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">{c}</span>
                            ))}
                        </div>
                    )}
                    {displayNaics.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                            {displayNaics.map((n, j) => (
                                <span key={j} className="text-[9px] font-mono bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">{n}</span>
                            ))}
                            {p.all_naics_codes.length > 5 && <span className="text-[9px] text-stone-400">+{p.all_naics_codes.length - 5}</span>}
                        </div>
                    )}
                    {p.capabilities_narrative && (
                        <p className="text-xs text-stone-600 mt-2 line-clamp-3">{p.capabilities_narrative}</p>
                    )}
                    {(p.contact_name || p.contact_email) && (
                        <div className="mt-2 pt-2 border-t border-stone-100 text-xs text-stone-600 space-y-0.5">
                            {p.contact_name && <div className="font-medium">{p.contact_name}</div>}
                            {p.contact_email && (
                                <a href={`mailto:${p.contact_email}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 break-all">
                                    <Mail className="w-3 h-3 flex-shrink-0" />{p.contact_email}
                                </a>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {p.sba_profile_url && (
                        <a href={p.sba_profile_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                            <Shield className="w-3 h-3" /> SBA
                        </a>
                    )}
                    {p.capabilities_statement_url && (
                        <a href={p.capabilities_statement_url.startsWith("http") ? p.capabilities_statement_url : `https://${p.capabilities_statement_url}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-bold text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                            <Award className="w-3 h-3" /> Cap stmt
                        </a>
                    )}
                    {saved ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Saved
                        </span>
                    ) : (
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => onSave({
                                company_name: p.business_name,
                                website: p.capabilities_statement_url || null,
                                uei: p.uei,
                                naics_codes: p.all_naics_codes,
                                state: p.state,
                                certifications: p.certifications,
                            }, "potential")}
                            className="text-[10px] font-bold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 px-2 py-0.5 rounded inline-flex items-center gap-1 disabled:opacity-50">
                            <Plus className="w-3 h-3" /> {saving ? "Saving…" : "Save"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
