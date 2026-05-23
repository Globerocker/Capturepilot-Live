"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Globe2, Building2, Clock } from "lucide-react";

interface Stats {
    total: number;
    federal: number;
    sled: number;
    new_last_7d: number;
    expiring_soon: number;
    sources_sought: number;
    generated_at: string;
}

/**
 * Live counter — polls /api/opportunities/stats every 60s. Drop-in for the
 * dashboard top bar AND the public marketing site. The endpoint is CDN-cached
 * server-side so polling doesn't hit Postgres on every tick.
 *
 * variant="compact" → single-row inline badge ("12,847 active opportunities")
 * variant="rich"    → 4-tile card with sub-counts (federal / state / new / urgent)
 */
export default function LiveOpportunityCount({
    variant = "rich",
    apiBase = "",
}: {
    variant?: "compact" | "rich";
    apiBase?: string;
}) {
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function fetchStats() {
            try {
                const r = await fetch(`${apiBase}/api/opportunities/stats`, { cache: "no-store" });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json() as Stats;
                if (!cancelled) {
                    setStats(data);
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        }
        fetchStats();
        const id = setInterval(fetchStats, 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [apiBase]);

    if (error && !stats) {
        return (
            <div className="text-xs text-stone-400">Live counts unavailable</div>
        );
    }

    if (!stats) {
        return (
            <div className="flex items-center gap-2 text-stone-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading live counts…
            </div>
        );
    }

    const fmt = (n: number) => n.toLocaleString();

    if (variant === "compact") {
        return (
            <div className="inline-flex items-center gap-2 text-sm">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-stone-800 tabular-nums">{fmt(stats.total)}</span>
                <span className="text-stone-500">active opportunities</span>
                {stats.new_last_7d > 0 && (
                    <span className="text-emerald-600 font-semibold ml-1">+{fmt(stats.new_last_7d)} this week</span>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Live Opportunity Counter
                </h3>
                <span className="text-[10px] text-stone-400 uppercase tracking-wider">Updates every 60s</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-stone-100 border-b border-stone-100">
                <div className="p-5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Globe2 className="w-3 h-3 text-stone-400" />
                        <p className="text-[10px] text-stone-400 uppercase tracking-wider">Total Active</p>
                    </div>
                    <p className="text-3xl font-black text-stone-900 tabular-nums">{fmt(stats.total)}</p>
                </div>
                <div className="p-5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Building2 className="w-3 h-3 text-blue-500" />
                        <p className="text-[10px] text-blue-600 uppercase tracking-wider">Federal</p>
                    </div>
                    <p className="text-3xl font-black text-blue-700 tabular-nums">{fmt(stats.federal)}</p>
                </div>
                <div className="p-5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Building2 className="w-3 h-3 text-emerald-500" />
                        <p className="text-[10px] text-emerald-600 uppercase tracking-wider">State / Local</p>
                    </div>
                    <p className="text-3xl font-black text-emerald-700 tabular-nums">{fmt(stats.sled)}</p>
                </div>
                <div className="p-5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                        <TrendingUp className="w-3 h-3 text-stone-400" />
                        <p className="text-[10px] text-stone-400 uppercase tracking-wider">New / 7d</p>
                    </div>
                    <p className="text-3xl font-black text-stone-900 tabular-nums">+{fmt(stats.new_last_7d)}</p>
                </div>
            </div>
            <div className="px-5 py-2.5 bg-stone-50 flex items-center justify-between text-[11px] text-stone-500">
                <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span><b className="text-amber-600">{fmt(stats.expiring_soon)}</b> expiring soon · <b className="text-stone-700">{fmt(stats.sources_sought)}</b> Sources Sought</span>
                </span>
                <span className="text-[10px] text-stone-400">Live • {new Date(stats.generated_at).toLocaleTimeString()}</span>
            </div>
        </div>
    );
}
