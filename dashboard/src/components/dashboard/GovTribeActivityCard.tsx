"use client";

import { useEffect, useState } from "react";
import { Activity, ExternalLink, Loader2 } from "lucide-react";

interface Bucket { key: { name: string; n_a_i_c_s?: string }; doc_count: number }
interface Activity {
    total: number;
    path: string;
    aggregations: {
        top_federal_agencies_by_doc_count?: { buckets: Bucket[] };
        top_naics_codes_by_doc_count?: { buckets: Bucket[] };
        top_set_aside_types_by_doc_count?: { buckets: Bucket[] };
        top_psc_codes_by_doc_count?: { buckets: Bucket[] };
    };
}

/** Dashboard widget: pulse of federal opportunity posting volume in last N days. */
export default function GovTribeActivityCard({ days = 14, naicsIds }: { days?: number; naicsIds?: string[] }) {
    const [data, setData] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = new URLSearchParams({ days: String(days) });
        if (naicsIds?.length) q.set("naics", naicsIds.join(","));
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/intelligence/govtribe/activity-summary?${q.toString()}`);
                if (!res.ok) { if (!cancelled) setLoading(false); return; }
                const body = await res.json();
                if (!cancelled) { setData(body.error ? null : body); setLoading(false); }
            } catch {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [days, naicsIds]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center justify-center min-h-[120px]">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }
    if (!data || data.total === 0) return null;

    const agencies = data.aggregations.top_federal_agencies_by_doc_count?.buckets || [];
    const naics = data.aggregations.top_naics_codes_by_doc_count?.buckets || [];
    const setAsides = data.aggregations.top_set_aside_types_by_doc_count?.buckets || [];

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold flex items-center gap-2 text-stone-800">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    Federal Market Pulse — last {days} days
                </h3>
                <a href={data.path} target="_blank" rel="noreferrer" className="text-xs text-stone-500 hover:text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap">
                    See all {data.total.toLocaleString()} <ExternalLink className="w-3 h-3" />
                </a>
            </div>
            <div className="p-4 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <KPI label="Opps Posted" value={data.total.toLocaleString()} />
                    <KPI label="Top Agency" value={agencies[0]?.key?.name?.split(" ").slice(0, 2).join(" ") || "—"} sub={agencies[0] ? `${agencies[0].doc_count}` : ""} />
                    <KPI label="Top NAICS" value={naics[0]?.key?.n_a_i_c_s || "—"} sub={naics[0]?.key?.name?.slice(0, 24)} />
                    <KPI label="Set-Aside Lead" value={setAsides[0]?.key?.name?.split(" ")[0] || "—"} sub={setAsides[0] ? `${setAsides[0].doc_count}` : ""} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                    <Mini title="Top Agencies" buckets={agencies.slice(0, 5)} />
                    <Mini title="Top NAICS" buckets={naics.slice(0, 5)} showCode />
                </div>
            </div>
        </div>
    );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-stone-400 uppercase tracking-widest">{label}</p>
            <p className="text-lg font-bold text-stone-800 leading-tight mt-1">{value}</p>
            {sub && <p className="text-[10px] text-stone-500 mt-0.5">{sub}</p>}
        </div>
    );
}

function Mini({ title, buckets, showCode }: { title: string; buckets: Bucket[]; showCode?: boolean }) {
    if (buckets.length === 0) return null;
    return (
        <div>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">{title}</p>
            <div className="bg-stone-50/60 rounded-xl border border-stone-100 divide-y divide-stone-100">
                {buckets.map((b, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-stone-700 truncate">{b.key.name}</p>
                            {showCode && b.key.n_a_i_c_s && <p className="text-[10px] text-stone-400 font-mono mt-0.5">{b.key.n_a_i_c_s}</p>}
                        </div>
                        <p className="text-stone-600 font-mono text-xs tabular-nums">{b.doc_count.toLocaleString()}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
