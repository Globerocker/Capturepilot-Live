"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Loader2 } from "lucide-react";

interface Bucket { key: { name: string; n_a_i_c_s?: string }; doc_count: number }
interface Forecasts {
    total: number;
    path: string;
    aggregations: Record<string, { buckets: Bucket[] }>;
}

/** Opportunity-detail card: future federal forecasts in the same NAICS — gives
 *  the user a heads-up on related upcoming RFPs from the same buying community. */
export default function GovTribeForecastCard({ naicsCode, agency }: { naicsCode?: string | null; agency?: string | null }) {
    const [data, setData] = useState<Forecasts | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!naicsCode && !agency) { setLoading(false); return; }
        const q = new URLSearchParams();
        if (naicsCode) q.set("naics", naicsCode);
        if (agency) q.set("agency", agency);
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/intelligence/govtribe/forecasts?${q.toString()}`);
                if (!res.ok) { if (!cancelled) setLoading(false); return; }
                const body = await res.json();
                if (!cancelled) { setData(body.error ? null : body); setLoading(false); }
            } catch { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [naicsCode, agency]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center justify-center min-h-[100px]">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }
    if (!data || data.total === 0) return null;

    const agencies = data.aggregations.top_federal_agencies_by_doc_count?.buckets || [];
    const setAsides = data.aggregations.top_set_aside_types_by_doc_count?.buckets || [];

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 border-b border-indigo-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold flex items-center gap-2 text-indigo-900">
                    <CalendarClock className="w-4 h-4 text-indigo-500" />
                    Upcoming Forecasts {naicsCode ? <span className="font-mono font-normal text-xs text-indigo-700">NAICS {naicsCode}</span> : null}
                </h3>
                <a href={data.path} target="_blank" rel="noreferrer" className="text-xs text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 whitespace-nowrap">
                    {data.total.toLocaleString()} forecasts <ExternalLink className="w-3 h-3" />
                </a>
            </div>
            <div className="p-4 sm:p-6 grid sm:grid-cols-2 gap-4">
                {agencies.length > 0 && (
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Forecasting Agencies</p>
                        <div className="bg-stone-50/60 rounded-xl border border-stone-100 divide-y divide-stone-100">
                            {agencies.slice(0, 5).map((b, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                                    <p className="text-stone-700 truncate min-w-0 flex-1">{b.key.name}</p>
                                    <p className="text-stone-600 font-mono text-xs tabular-nums">{b.doc_count.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {setAsides.length > 0 && (
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Set-Aside Mix</p>
                        <div className="bg-stone-50/60 rounded-xl border border-stone-100 divide-y divide-stone-100">
                            {setAsides.slice(0, 5).map((b, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                                    <p className="text-stone-700 truncate min-w-0 flex-1">{b.key.name}</p>
                                    <p className="text-stone-600 font-mono text-xs tabular-nums">{b.doc_count.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
