"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { BarChart3, Loader2, TrendingUp, Building2, Users, DollarSign, RefreshCw, ChevronDown } from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

interface AwardSummary {
    total_awards_returned: number;
    total_spend_returned: number;
    avg_award_size: number;
    unique_incumbents: number;
}

interface Incumbent {
    name: string;
    uei: string | null;
    total: number;
    count: number;
}

interface SpendingYear {
    fiscal_year: string;
    amount: number;
}

interface TopRecipient {
    name: string;
    total_amount: number;
    contract_count: number;
}

interface NaicsIntel {
    naics: string;
    loading: boolean;
    error: string | null;
    summary: AwardSummary | null;
    incumbents: Incumbent[];
    spending_by_year: SpendingYear[];
    top_recipients: TopRecipient[];
}

function formatCurrency(val: number): string {
    if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
}

export default function IntelligencePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [naicsCodes, setNaicsCodes] = useState<string[]>([]);
    const [companyName, setCompanyName] = useState("");
    const [intelData, setIntelData] = useState<NaicsIntel[]>([]);
    const [selectedNaics, setSelectedNaics] = useState<string>("");
    const [expandedIncumbent, setExpandedIncumbent] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("naics_codes, company_name")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            const codes = (profile as Record<string, unknown>).naics_codes as string[] || [];
            setNaicsCodes(codes);
            setCompanyName((profile as Record<string, unknown>).company_name as string || "");
            if (codes.length > 0) setSelectedNaics(codes[0]);
            setLoading(false);
        })();
    }, [router]);

    const fetchIntel = useCallback(async (naics: string) => {
        // Check if already loaded
        const existing = intelData.find(d => d.naics === naics);
        if (existing && !existing.error) return;

        setIntelData(prev => [
            ...prev.filter(d => d.naics !== naics),
            { naics, loading: true, error: null, summary: null, incumbents: [], spending_by_year: [], top_recipients: [] },
        ]);

        try {
            const res = await fetch(`/api/intelligence/awards?naics=${naics}&limit=50&years=3`);
            if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
            const data = await res.json();

            setIntelData(prev => [
                ...prev.filter(d => d.naics !== naics),
                {
                    naics,
                    loading: false,
                    error: null,
                    summary: data.summary,
                    incumbents: data.incumbents || [],
                    spending_by_year: data.spending_by_year || [],
                    top_recipients: data.top_recipients || [],
                },
            ]);
        } catch (err) {
            setIntelData(prev => [
                ...prev.filter(d => d.naics !== naics),
                { naics, loading: false, error: (err as Error).message, summary: null, incumbents: [], spending_by_year: [], top_recipients: [] },
            ]);
        }
    }, [intelData]);

    useEffect(() => {
        if (selectedNaics) fetchIntel(selectedNaics);
    }, [selectedNaics]); // eslint-disable-line react-hooks/exhaustive-deps

    const currentData = intelData.find(d => d.naics === selectedNaics);

    // Compute max spend for bar chart scaling
    const maxSpend = currentData?.spending_by_year?.length
        ? Math.max(...currentData.spending_by_year.map(s => s.amount))
        : 0;

    if (loading) {
        return (
            <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 px-1">
                <div className="h-8 w-48 bg-stone-200 rounded animate-pulse" />
                <div className="h-4 w-72 bg-stone-100 rounded animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    if (naicsCodes.length === 0) {
        return (
            <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 px-1">
                <header>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                        <BarChart3 className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Market Intelligence
                    </h2>
                </header>
                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-12 text-center">
                    <BarChart3 className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm mb-2">No NAICS codes configured</p>
                    <p className="text-stone-400 text-xs mb-4">Add your NAICS codes in Settings to see market intelligence for your industry sectors.</p>
                    <a href="/settings" className="bg-black text-white px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2">
                        Go to Settings
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 px-1">
            <header>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <BarChart3 className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Market Intelligence
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Federal spending data and competitor insights for {companyName || "your business"}
                </p>
            </header>

            {/* NAICS selector */}
            <div className="flex flex-wrap gap-2">
                {naicsCodes.map(code => (
                    <button
                        key={code}
                        type="button"
                        onClick={() => setSelectedNaics(code)}
                        className={clsx(
                            "text-xs font-bold font-mono px-4 py-2 rounded-full transition-all border",
                            selectedNaics === code
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                        )}
                    >
                        {code}
                    </button>
                ))}
            </div>

            {/* Loading state */}
            {currentData?.loading && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-3" />
                    <p className="text-sm text-stone-500">Fetching market data for NAICS {selectedNaics}...</p>
                    <p className="text-xs text-stone-400 mt-1">Querying USASpending.gov</p>
                </div>
            )}

            {/* Error state */}
            {currentData?.error && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                    <p className="text-sm text-red-600 mb-2">{currentData.error}</p>
                    <button type="button" onClick={() => fetchIntel(selectedNaics)} className="text-xs font-bold text-red-700 hover:underline inline-flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                </div>
            )}

            {/* Data display */}
            {currentData && !currentData.loading && !currentData.error && currentData.summary && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <DollarSign className="w-5 h-5 text-emerald-500" />
                            </div>
                            <p className="text-2xl font-black tracking-tighter">{formatCurrency(currentData.summary.total_spend_returned)}</p>
                            <p className="text-[10px] text-stone-400 uppercase mt-0.5">Total Spend (3yr)</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <TrendingUp className="w-5 h-5 text-blue-500" />
                            </div>
                            <p className="text-2xl font-black tracking-tighter">{formatCurrency(currentData.summary.avg_award_size)}</p>
                            <p className="text-[10px] text-stone-400 uppercase mt-0.5">Avg Award Size</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <Building2 className="w-5 h-5 text-amber-500" />
                            </div>
                            <p className="text-2xl font-black tracking-tighter">{currentData.summary.total_awards_returned}</p>
                            <p className="text-[10px] text-stone-400 uppercase mt-0.5">Awards Found</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <Users className="w-5 h-5 text-purple-500" />
                            </div>
                            <p className="text-2xl font-black tracking-tighter">{currentData.summary.unique_incumbents}</p>
                            <p className="text-[10px] text-stone-400 uppercase mt-0.5">Unique Contractors</p>
                        </div>
                    </div>

                    {/* Spending by Year Bar Chart */}
                    {currentData.spending_by_year.length > 0 && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-stone-400" /> Federal Spending by Fiscal Year
                            </h3>
                            <div className="space-y-3">
                                {currentData.spending_by_year.map((year) => {
                                    const widthPercent = maxSpend > 0 ? (year.amount / maxSpend) * 100 : 0;
                                    return (
                                        <div key={year.fiscal_year} className="flex items-center gap-3">
                                            <span className="text-xs font-mono text-stone-500 w-12 text-right flex-shrink-0">FY{year.fiscal_year.slice(-2)}</span>
                                            <div className="flex-1 bg-stone-100 rounded-full h-7 overflow-hidden relative">
                                                <div
                                                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                                                    style={{ width: `${Math.max(widthPercent, 2)}%` }}
                                                >
                                                    {widthPercent > 25 && (
                                                        <span className="text-[10px] font-bold text-white whitespace-nowrap">{formatCurrency(year.amount)}</span>
                                                    )}
                                                </div>
                                                {widthPercent <= 25 && (
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-500">{formatCurrency(year.amount)}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Top Recipients / Agencies */}
                    {currentData.top_recipients.length > 0 && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-stone-400" /> Top Contractors in NAICS {selectedNaics}
                            </h3>
                            <div className="space-y-2">
                                {currentData.top_recipients.slice(0, 15).map((r, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-[10px] font-mono text-stone-400 w-5 text-right flex-shrink-0">#{idx + 1}</span>
                                            <span className="text-sm font-medium text-black truncate">{r.name}</span>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                                            <span className="font-bold text-emerald-700">{formatCurrency(r.total_amount)}</span>
                                            <span className="text-stone-400">{r.contract_count} awards</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Incumbents */}
                    {currentData.incumbents.length > 0 && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-stone-400" /> Known Incumbents
                            </h3>
                            <div className="space-y-1.5">
                                {currentData.incumbents.slice(0, 20).map((inc) => (
                                    <button
                                        key={inc.name}
                                        type="button"
                                        onClick={() => setExpandedIncumbent(expandedIncumbent === inc.name ? null : inc.name)}
                                        className="w-full text-left bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl p-3 transition-all"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-black truncate">{inc.name}</p>
                                                <p className="text-[10px] text-stone-400">{inc.count} award{inc.count !== 1 ? "s" : ""} totaling {formatCurrency(inc.total)}</p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-xs font-bold text-emerald-700">{formatCurrency(inc.total)}</span>
                                                <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform", expandedIncumbent === inc.name && "rotate-180")} />
                                            </div>
                                        </div>
                                        {expandedIncumbent === inc.name && (
                                            <div className="mt-2 pt-2 border-t border-stone-200 text-xs text-stone-500 space-y-1">
                                                {inc.uei && <p className="font-mono">UEI: {inc.uei}</p>}
                                                <p>Average award: {formatCurrency(inc.total / inc.count)}</p>
                                                {inc.uei && (
                                                    <a
                                                        href={`https://sam.gov/search/?q=${inc.uei}&index=ei`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-emerald-600 hover:underline inline-block mt-1"
                                                    >
                                                        View on SAM.gov
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
