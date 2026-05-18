"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Network } from "lucide-react";

interface Bucket { key: { name: string }; doc_count: number }
interface SubAwards {
    total: number;
    path: string;
    aggregations: {
        top_awardees_by_doc_count?: { buckets: Bucket[] };
        top_funding_federal_agencies_by_doc_count?: { buckets: Bucket[] };
        top_contracting_federal_agencies_by_doc_count?: { buckets: Bucket[] };
    };
}

/** Sub-award network for a recipient. Shows who they sub-contract WITH so
 *  users know who to team with on similar pursuits. */
export default function GovTribeSubAwardsCard({ query }: { query: string }) {
    const [data, setData] = useState<SubAwards | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!query) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/intelligence/govtribe/subawards?query=${encodeURIComponent(query)}`);
                if (!res.ok) { if (!cancelled) setLoading(false); return; }
                const body = await res.json();
                if (!cancelled) { setData(body.error ? null : body); setLoading(false); }
            } catch { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [query]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center justify-center min-h-[100px]">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }
    if (!data || data.total === 0) return null;

    const awardees = data.aggregations.top_awardees_by_doc_count?.buckets || [];
    const agencies = data.aggregations.top_contracting_federal_agencies_by_doc_count?.buckets || [];

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold flex items-center gap-2 text-stone-800">
                    <Network className="w-4 h-4 text-violet-500" />
                    Sub-Award Network
                </h3>
                <a href={data.path} target="_blank" rel="noreferrer" className="text-xs text-stone-500 hover:text-violet-700 inline-flex items-center gap-1 whitespace-nowrap">
                    {data.total.toLocaleString()} sub-awards <ExternalLink className="w-3 h-3" />
                </a>
            </div>
            <div className="p-4 sm:p-6 grid sm:grid-cols-2 gap-4">
                {awardees.length > 0 && (
                    <Block title="Teaming Partners" buckets={awardees.slice(0, 5)} />
                )}
                {agencies.length > 0 && (
                    <Block title="Contracting Agencies" buckets={agencies.slice(0, 5)} />
                )}
            </div>
        </div>
    );
}

function Block({ title, buckets }: { title: string; buckets: Bucket[] }) {
    return (
        <div>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">{title}</p>
            <div className="bg-stone-50/60 rounded-xl border border-stone-100 divide-y divide-stone-100">
                {buckets.map((b, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                        <p className="text-stone-700 truncate min-w-0 flex-1">{b.key.name}</p>
                        <p className="text-stone-600 font-mono text-xs tabular-nums">{b.doc_count.toLocaleString()}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
