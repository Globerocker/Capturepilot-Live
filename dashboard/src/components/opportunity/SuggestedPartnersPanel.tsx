"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Handshake, Loader2, Plus, CheckCircle2, MapPin, Award, Shield, ChevronRight } from "lucide-react";
import clsx from "clsx";

/**
 * SuggestedPartnersPanel
 *
 * Rendered on the opportunity detail page. Pulls teaming-partner candidates
 * filtered by this opportunity's NAICS + any set-aside certification hint,
 * so users can bring a shortlist to their capture team without leaving the
 * opportunity. Save-to-pipeline uses the existing /api/partners/save endpoint.
 *
 * Added Apr 20 after the review call: "display partner information and
 * subcontracting details on the opportunity detail page".
 */

interface Props {
    naicsCode: string | null | string[];
    setAsideCode: string | null;
    placeOfPerformanceState?: string | null;
}

interface Partner {
    uei: string | null;
    cage_code?: string | null;
    company_name: string;
    dba_name?: string | null;
    state?: string | null;
    city?: string | null;
    naics_codes: string[];
    certifications: string[];
    website?: string | null;
    sam_url?: string | null;
}

// Map a SAM set-aside code/description to the certification filter the
// partner search API expects. Conservative — if we can't map, leave empty
// so the search widens rather than returning zero results.
function deriveCertHint(setAside: string | null): string {
    if (!setAside) return "";
    const s = setAside.toUpperCase();
    if (s.includes("8(A)") || s.includes("8A")) return "8A";
    if (s.includes("SDVOSB") || s.includes("SERVICE-DISABLED VETERAN")) return "SDVOSB";
    if (s.includes("VOSB") || s.includes("VETERAN-OWNED")) return "VOSB";
    if (s.includes("HUBZONE")) return "HUBZONE";
    if (s.includes("WOSB") || s.includes("WOMEN-OWNED")) return "WOSB";
    if (s.includes("TRIBAL") || s.includes("INDIAN") || s.includes("NATIVE")) return "TRIBAL";
    return "";
}

export default function SuggestedPartnersPanel({ naicsCode, setAsideCode, placeOfPerformanceState }: Props) {
    const naics = useMemo(() => {
        if (Array.isArray(naicsCode)) return naicsCode.filter(Boolean).slice(0, 3);
        return naicsCode ? [naicsCode] : [];
    }, [naicsCode]);

    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedUEIs, setSavedUEIs] = useState<Set<string>>(new Set());
    const [savingUEI, setSavingUEI] = useState<string | null>(null);
    const [certFilter, setCertFilter] = useState<string>(deriveCertHint(setAsideCode));
    const [stateFilter, setStateFilter] = useState<string>(placeOfPerformanceState || "");

    useEffect(() => {
        if (naics.length === 0) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                for (const n of naics) params.append("naics", n);
                if (certFilter) params.set("set_aside", certFilter);
                if (stateFilter) params.append("state", stateFilter);
                params.set("limit", "15");
                const res = await fetch(`/api/partners/search?${params.toString()}`);
                const body = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setError(body.error || `Partner search failed (${res.status})`);
                    setPartners([]);
                } else {
                    setPartners(body.partners || []);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [naics, certFilter, stateFilter]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/partners/save");
                if (!res.ok) return;
                const body = await res.json() as { partners: { uei: string | null }[] };
                setSavedUEIs(new Set((body.partners || []).filter(p => p.uei).map(p => p.uei as string)));
            } catch { /* best-effort */ }
        })();
    }, []);

    async function handleSave(p: Partner) {
        if (!p.uei) return;
        setSavingUEI(p.uei);
        try {
            const res = await fetch("/api/partners/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company_name: p.company_name,
                    website: p.website || null,
                    uei: p.uei,
                    naics_codes: p.naics_codes || [],
                    state: p.state || null,
                    certifications: p.certifications || [],
                    status: "potential",
                }),
            });
            if (res.ok) setSavedUEIs(prev => new Set(prev).add(p.uei as string));
        } finally {
            setSavingUEI(null);
        }
    }

    if (naics.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-[15px] font-bold flex items-center text-stone-800">
                        <Handshake className="w-4 h-4 mr-2 text-emerald-600" /> Suggested Teaming Partners
                    </h2>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                        Top matches across NAICS {naics.join(", ")}
                        {certFilter && <> · <span className="font-bold">{certFilter}</span> certified</>}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        title="Certification filter"
                        value={certFilter}
                        onChange={e => setCertFilter(e.target.value)}
                        className="border border-stone-200 rounded-lg px-2 py-1 text-xs bg-white"
                    >
                        <option value="">Any cert</option>
                        <option value="8A">8(a)</option>
                        <option value="SDVOSB">SDVOSB</option>
                        <option value="VOSB">VOSB</option>
                        <option value="WOSB">WOSB</option>
                        <option value="HUBZONE">HUBZone</option>
                        <option value="TRIBAL">Tribal</option>
                    </select>
                    <input
                        type="text"
                        value={stateFilter}
                        onChange={e => setStateFilter(e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="State"
                        maxLength={2}
                        className="w-14 border border-stone-200 rounded-lg px-2 py-1 text-xs uppercase font-mono bg-white"
                    />
                    <Link href="/partners" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1">
                        Full search <ChevronRight className="w-3 h-3" />
                    </Link>
                </div>
            </div>

            <div className="p-4 sm:p-6">
                {loading && (
                    <div className="flex items-center gap-2 text-xs text-stone-500 py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Searching SAM.gov…
                    </div>
                )}

                {error && (
                    <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                {!loading && !error && partners.length === 0 && (
                    <p className="text-xs text-stone-500 py-4 text-center">
                        No partner matches with those filters — try widening the certification or state.
                    </p>
                )}

                {!loading && partners.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {partners.slice(0, 10).map((p, i) => (
                            <div key={p.uei || `${p.company_name}-${i}`} className="border border-stone-200 rounded-xl p-3 hover:border-stone-300 bg-stone-50/40">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-black line-clamp-1">{p.company_name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-stone-500">
                                            {p.state && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.city ? `${p.city}, ${p.state}` : p.state}</span>}
                                            {p.uei && <span className="font-mono text-[10px] text-stone-400">UEI: {p.uei}</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 flex-shrink-0">
                                        {p.sam_url && (
                                            <a href={p.sam_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                                <Shield className="w-3 h-3" /> SAM.gov
                                            </a>
                                        )}
                                        {p.uei && (
                                            savedUEIs.has(p.uei) ? (
                                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Saved
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={savingUEI === p.uei}
                                                    onClick={() => handleSave(p)}
                                                    className="text-[10px] font-bold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 px-2 py-0.5 rounded inline-flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    <Plus className="w-3 h-3" /> {savingUEI === p.uei ? "Saving…" : "Save"}
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>
                                {p.certifications.length > 0 && (
                                    <div className="flex gap-1 mt-2 flex-wrap">
                                        {p.certifications.slice(0, 4).map((c, j) => (
                                            <span
                                                key={j}
                                                className={clsx(
                                                    "text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase",
                                                    c.toUpperCase().includes(certFilter) && certFilter
                                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                                        : "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                )}
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {p.naics_codes.length > 0 && (
                                    <div className="flex gap-1 mt-1.5 flex-wrap">
                                        {p.naics_codes.slice(0, 5).map((n, j) => (
                                            <span
                                                key={j}
                                                className={clsx(
                                                    "text-[9px] font-mono px-1.5 py-0.5 rounded",
                                                    naics.includes(n) ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-stone-100 text-stone-500",
                                                )}
                                            >
                                                {n}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {partners.length >= 10 && (
                <div className="px-4 sm:px-6 py-3 border-t border-stone-100 bg-stone-50/60 text-center">
                    <Link href="/partners" className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1">
                        <Award className="w-3 h-3" /> Open full Partner Search for deeper filters
                    </Link>
                </div>
            )}
        </div>
    );
}
