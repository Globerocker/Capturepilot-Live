"use client";

import { useEffect, useState } from "react";
import { Building2, ExternalLink, Loader2, TrendingUp, Trophy } from "lucide-react";

interface Bucket {
    key: { name?: string; n_a_i_c_s?: string; defense_or_civilian?: string };
    doc_count: number;
    sum_value: { value: number };
}

interface Summary {
    total: number;
    path: string;
    aggregations: {
        dollars_obligated_stats?: { count: number; min: number; max: number; avg: number; sum: number };
        top_contracting_federal_agencies_by_dollars_obligated?: { buckets: Bucket[] };
        top_naics_codes_by_dollars_obligated?: { buckets: Bucket[] };
        top_idvs_by_dollars_obligated?: { buckets: Bucket[] };
        top_set_aside_types_by_dollars_obligated?: { buckets: Bucket[] };
    };
    source: "cache" | "live";
}

function fmt(n: number): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

export default function GovTribeAwardsCard({ query }: { query: string }) {
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!query) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/intelligence/govtribe/awards-summary?query=${encodeURIComponent(query)}`);
                if (!res.ok) {
                    if (!cancelled) { setErr("upstream error"); setLoading(false); }
                    return;
                }
                const body = await res.json();
                if (cancelled) return;
                if (body.error) setErr(body.error); else setData(body);
                setLoading(false);
            } catch {
                if (!cancelled) { setErr("network"); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [query]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center justify-center min-h-[120px]">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }
    if (err || !data || data.total === 0) {
        return null; // hide rather than show empty state — keeps the page clean
    }

    const stats = data.aggregations.dollars_obligated_stats;
    const agencies = data.aggregations.top_contracting_federal_agencies_by_dollars_obligated?.buckets || [];
    const naics = data.aggregations.top_naics_codes_by_dollars_obligated?.buckets || [];
    const idvs = data.aggregations.top_idvs_by_dollars_obligated?.buckets || [];
    const setAsides = data.aggregations.top_set_aside_types_by_dollars_obligated?.buckets || [];

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 text-stone-800">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    GovTribe Awards Intelligence
                    <span className="text-[10px] text-stone-400 font-normal">— {data.source}</span>
                </h3>
                <a
                    href={data.path}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-stone-500 hover:text-emerald-700 inline-flex items-center gap-1"
                >
                    View all {data.total.toLocaleString()} on GovTribe <ExternalLink className="w-3 h-3" />
                </a>
            </div>
            <div className="p-4 sm:p-6 space-y-5">
                {/* KPI tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Tile label="Total Awards" value={data.total.toLocaleString()} />
                    <Tile label="Total Obligated" value={fmt(stats?.sum || 0)} />
                    <Tile label="Avg Award" value={fmt(stats?.avg || 0)} />
                    <Tile label="Largest" value={fmt(stats?.max || 0)} />
                </div>

                {/* Top agencies */}
                {agencies.length > 0 && (
                    <Block icon={Building2} title="Top Contracting Agencies">
                        {agencies.slice(0, 5).map((b, i) => (
                            <Row
                                key={i}
                                left={b.key.name || "Unknown"}
                                right={`${fmt(b.sum_value.value)} · ${b.doc_count}`}
                                meta={b.key.defense_or_civilian}
                            />
                        ))}
                    </Block>
                )}

                {/* Top NAICS */}
                {naics.length > 0 && (
                    <Block icon={TrendingUp} title="Top NAICS Categories">
                        {naics.slice(0, 5).map((b, i) => (
                            <Row
                                key={i}
                                left={b.key.name || "Unknown"}
                                right={`${fmt(b.sum_value.value)} · ${b.doc_count}`}
                                meta={b.key.n_a_i_c_s}
                            />
                        ))}
                    </Block>
                )}

                {/* Two-column: top IDVs + set-asides */}
                {(idvs.length > 0 || setAsides.length > 0) && (
                    <div className="grid sm:grid-cols-2 gap-5">
                        {idvs.length > 0 && (
                            <Block title="Top IDV Vehicles">
                                {idvs.slice(0, 4).map((b, i) => (
                                    <Row key={i} left={b.key.name || "Unknown"} right={fmt(b.sum_value.value)} />
                                ))}
                            </Block>
                        )}
                        {setAsides.length > 0 && (
                            <Block title="Set-Aside Distribution">
                                {setAsides.slice(0, 4).map((b, i) => (
                                    <Row key={i} left={b.key.name || "Open"} right={`${fmt(b.sum_value.value)} · ${b.doc_count}`} />
                                ))}
                            </Block>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Tile({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-lg font-bold text-stone-800 leading-tight">{value}</p>
        </div>
    );
}

function Block({ icon: Icon, title, children }: { icon?: typeof Building2; title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {title}
            </p>
            <div className="bg-stone-50/60 rounded-xl border border-stone-100 divide-y divide-stone-100">
                {children}
            </div>
        </div>
    );
}

function Row({ left, right, meta }: { left: string; right: string; meta?: string }) {
    return (
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 text-sm gap-3">
            <div className="min-w-0 flex-1">
                <p className="text-stone-700 truncate">{left}</p>
                {meta && <p className="text-[10px] text-stone-400 font-mono mt-0.5">{meta}</p>}
            </div>
            <p className="text-stone-700 font-mono text-xs tabular-nums whitespace-nowrap">{right}</p>
        </div>
    );
}
