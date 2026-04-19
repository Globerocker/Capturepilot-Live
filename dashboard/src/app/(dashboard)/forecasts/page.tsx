"use client";

import { useEffect, useState } from "react";
import {
    Telescope,
    Building2,
    Calendar,
    ExternalLink,
    Loader2,
    Sparkles,
    Filter,
} from "lucide-react";
import clsx from "clsx";

interface ForecastChange {
    id: string;
    detected_at: string;
    diff_summary: string | null;
    added_lines: string[];
    naics_detected: string[];
    raw_snippet: string | null;
    agency_forecast_sources: {
        agency: string;
        label: string;
        url: string;
    } | null;
}

export default function ForecastsPage() {
    const [changes, setChanges] = useState<ForecastChange[]>([]);
    const [userNaics, setUserNaics] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [onlyMatching, setOnlyMatching] = useState(true);
    const [days, setDays] = useState(30);

    async function load() {
        setLoading(true);
        const params = new URLSearchParams({
            days: String(days),
            only_matching_naics: onlyMatching ? "1" : "0",
        });
        const res = await fetch(`/api/forecast-changes?${params}`);
        const data = await res.json();
        setChanges((data.changes || []) as ForecastChange[]);
        setUserNaics((data.user_naics || []) as string[]);
        setLoading(false);
    }

    useEffect(() => {
        load();
    }, [onlyMatching, days]);

    const matchedTotal = changes.reduce(
        (s, c) => s + c.naics_detected.filter((n) => userNaics.includes(n)).length,
        0
    );

    return (
        <div className="max-w-5xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black flex items-center gap-2">
                    <Telescope className="w-7 h-7" />
                    Agency Forecast Radar
                </h1>
                <p className="text-stone-500 mt-1 text-sm">
                    Federal agencies publish forecast pages months before solicitations drop on SAM.gov. Our daily
                    scanner flags new line items so you can engage with contracting officers before the RFP arrives.
                </p>
            </header>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-stone-500" />
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Filters</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={onlyMatching}
                            onChange={(e) => setOnlyMatching(e.target.checked)}
                            className="w-4 h-4"
                        />
                        <span className="text-sm text-stone-700">
                            Only my NAICS{" "}
                            {userNaics.length > 0 && (
                                <span className="text-xs text-stone-500">
                                    ({userNaics.slice(0, 3).join(", ")}
                                    {userNaics.length > 3 && ` + ${userNaics.length - 3}`})
                                </span>
                            )}
                        </span>
                    </label>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-stone-600">Last</span>
                        <select
                            value={days}
                            onChange={(e) => setDays(Number(e.target.value))}
                            className="px-3 py-1.5 text-sm border border-stone-300 rounded-lg"
                        >
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                            <option value={60}>60 days</option>
                            <option value={90}>90 days</option>
                        </select>
                    </div>

                    <div className="ml-auto text-xs text-stone-500 font-medium">
                        {changes.length} changes · {matchedTotal} NAICS matches
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
            ) : changes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center">
                    <Telescope className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-stone-700">No forecast changes detected.</p>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                        The daily scanner runs at 06:30 UTC. Uncheck &ldquo;Only my NAICS&rdquo; if you want to see all
                        activity, not just yours.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {changes.map((c) => (
                        <ChangeCard key={c.id} change={c} userNaics={userNaics} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ChangeCard({ change, userNaics }: { change: ForecastChange; userNaics: string[] }) {
    const src = change.agency_forecast_sources;
    const matchingNaics = change.naics_detected.filter((n) => userNaics.includes(n));
    const otherNaics = change.naics_detected.filter((n) => !userNaics.includes(n));
    const hasMatch = matchingNaics.length > 0;

    return (
        <div
            className={clsx(
                "bg-white rounded-2xl border-2 p-5",
                hasMatch ? "border-emerald-300" : "border-stone-200",
            )}
        >
            <div className="flex items-start justify-between mb-2 gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">
                        {src?.label || "Agency forecast"}
                    </p>
                    <p className="text-xs text-stone-500 truncate flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {src?.agency || "—"}
                        <Calendar className="w-3 h-3 ml-2" />
                        {new Date(change.detected_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        })}
                    </p>
                </div>
                {hasMatch && (
                    <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                        <Sparkles className="w-3 h-3" />
                        {matchingNaics.length} NAICS match
                    </span>
                )}
            </div>

            <p className="text-xs text-stone-600 mb-3">{change.diff_summary || "—"}</p>

            {change.naics_detected.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                    {matchingNaics.map((n) => (
                        <span
                            key={n}
                            className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        >
                            {n}
                        </span>
                    ))}
                    {otherNaics.slice(0, 8).map((n) => (
                        <span
                            key={n}
                            className="bg-stone-100 text-stone-600 text-[10px] px-2 py-0.5 rounded-full"
                        >
                            {n}
                        </span>
                    ))}
                    {otherNaics.length > 8 && (
                        <span className="text-[10px] text-stone-400 self-center">+{otherNaics.length - 8}</span>
                    )}
                </div>
            )}

            {change.added_lines.length > 0 && (
                <details className="mb-2">
                    <summary className="text-xs font-bold text-stone-700 cursor-pointer hover:text-emerald-700">
                        Show new line items ({change.added_lines.length})
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                        {change.added_lines.map((line, i) => (
                            <li key={i} className="text-xs text-stone-700 leading-relaxed list-disc">
                                {line.slice(0, 300)}
                                {line.length > 300 && "…"}
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {src?.url && (
                <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                >
                    Open source page
                    <ExternalLink className="w-3 h-3" />
                </a>
            )}
        </div>
    );
}
