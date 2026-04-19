"use client";

import { useEffect, useState } from "react";
import {
    Radar,
    Loader2,
    Building2,
    Calendar,
    DollarSign,
    TrendingUp,
    Filter,
} from "lucide-react";
import clsx from "clsx";

interface Recompete {
    id: string;
    source_award_id: string | null;
    incumbent_uei: string | null;
    incumbent_name: string | null;
    agency: string | null;
    naics_code: string | null;
    psc_code: string | null;
    set_aside: string | null;
    original_award_value: number | null;
    contract_end_date: string | null;
    months_to_end: number | null;
    confidence: "high" | "medium" | "low";
    confidence_score: number;
    reasoning: string | null;
    matched_sam_notice_id: string | null;
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-emerald-100", text: "text-emerald-800", label: "HIGH CONFIDENCE" },
    medium: { bg: "bg-amber-100", text: "text-amber-800", label: "MEDIUM" },
    low: { bg: "bg-stone-100", text: "text-stone-600", label: "LOW" },
};

function fmtMoney(n: number | null): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
}

export default function RecompetesPage() {
    const [candidates, setCandidates] = useState<Recompete[]>([]);
    const [loading, setLoading] = useState(true);
    const [minConfidence, setMinConfidence] = useState<"high" | "medium" | "low">("medium");
    const [monthsMax, setMonthsMax] = useState<number>(12);
    const [agencyFilter, setAgencyFilter] = useState("");

    async function load() {
        setLoading(true);
        const params = new URLSearchParams({
            min_confidence: minConfidence,
            months_max: String(monthsMax),
        });
        if (agencyFilter) params.set("agency", agencyFilter);
        const res = await fetch(`/api/recompetes?${params.toString()}`);
        const data = await res.json();
        setCandidates(data.candidates || []);
        setLoading(false);
    }

    useEffect(() => {
        load();
    }, [minConfidence, monthsMax, agencyFilter]);

    const highCount = candidates.filter((c) => c.confidence === "high").length;
    const totalValue = candidates.reduce((s, c) => s + (c.original_award_value || 0), 0);

    return (
        <div className="max-w-7xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black flex items-center gap-2">
                    <Radar className="w-7 h-7" />
                    Recompete Radar
                </h1>
                <p className="text-stone-500 mt-1 text-sm">
                    Contracts expiring in the next 3-18 months. These are candidates for recompete — often dropped as
                    new solicitations 6-12 months before the current contract ends.
                </p>
            </header>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Stat icon={TrendingUp} label="Candidates" value={String(candidates.length)} />
                <Stat icon={Radar} label="High confidence" value={String(highCount)} />
                <Stat icon={DollarSign} label="Total pipeline" value={fmtMoney(totalValue)} />
                <Stat icon={Calendar} label="Window" value={`≤ ${monthsMax} mo.`} />
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-stone-500" />
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Filters</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-1 uppercase">
                            Min confidence
                        </label>
                        <select
                            value={minConfidence}
                            onChange={(e) => setMinConfidence(e.target.value as typeof minConfidence)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        >
                            <option value="high">High only</option>
                            <option value="medium">Medium + High</option>
                            <option value="low">All</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-1 uppercase">
                            Max months to end
                        </label>
                        <select
                            value={monthsMax}
                            onChange={(e) => setMonthsMax(Number(e.target.value))}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        >
                            <option value={6}>6 months</option>
                            <option value={9}>9 months</option>
                            <option value={12}>12 months</option>
                            <option value={18}>18 months</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-1 uppercase">Agency</label>
                        <input
                            type="text"
                            placeholder="e.g. Navy, Veterans"
                            value={agencyFilter}
                            onChange={(e) => setAgencyFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        />
                    </div>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
            ) : candidates.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center">
                    <Radar className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-stone-700">No recompete candidates match your filters.</p>
                    <p className="text-xs text-stone-500 mt-1">
                        Try widening the months window or dropping to medium confidence.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {candidates.map((c) => (
                        <RecompeteRow key={c.id} candidate={c} />
                    ))}
                </div>
            )}
        </div>
    );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-stone-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}</span>
            </div>
            <p className="text-xl font-black text-stone-900">{value}</p>
        </div>
    );
}

function RecompeteRow({ candidate }: { candidate: Recompete }) {
    const style = CONFIDENCE_STYLES[candidate.confidence] || CONFIDENCE_STYLES.low;
    const endDate = candidate.contract_end_date
        ? new Date(candidate.contract_end_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "—";

    return (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 hover:border-emerald-300 transition-colors">
            <div className="flex items-start justify-between mb-2 gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">
                        {candidate.incumbent_name || "Unknown incumbent"}
                    </p>
                    <p className="text-xs text-stone-500 truncate flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {candidate.agency || "Agency unknown"}
                    </p>
                </div>
                <span
                    className={clsx(
                        style.bg,
                        style.text,
                        "text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0",
                    )}
                >
                    {style.label} · {Math.round(candidate.confidence_score * 100)}%
                </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-600 mb-3">
                <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-stone-400" />
                    Ends {endDate} ({candidate.months_to_end} mo.)
                </span>
                <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-stone-400" />
                    {fmtMoney(candidate.original_award_value)}
                </span>
                {candidate.naics_code && (
                    <span className="text-stone-500">NAICS {candidate.naics_code}</span>
                )}
                {candidate.set_aside && candidate.set_aside !== "NO SET ASIDE USED." && (
                    <span className="text-stone-500 italic">{candidate.set_aside}</span>
                )}
            </div>

            {candidate.reasoning && (
                <p className="text-xs text-stone-600 leading-relaxed border-l-2 border-emerald-200 pl-3 italic">
                    {candidate.reasoning}
                </p>
            )}

            {candidate.matched_sam_notice_id && (
                <a
                    href={`/opportunities/${candidate.matched_sam_notice_id}`}
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                >
                    Live solicitation matched →
                </a>
            )}
        </div>
    );
}
