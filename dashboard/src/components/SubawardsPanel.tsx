"use client";

import { useEffect, useState } from "react";
import { GitBranch, Loader2, Calendar } from "lucide-react";
import clsx from "clsx";

interface Relationship {
    partner: string;
    total_value: number;
    sub_count: number;
    primary_agency: string | null;
    last_date: string | null;
}

function fmt(n: number): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

/**
 * Renders both "as sub" (primes this company has sub-contracted TO) and
 * "as prime" (subs this company has hired as prime) views of the subaward
 * graph. Sourced live from USASpending.gov.
 *
 * Useful on partner + competitor detail pages — the user sees the full
 * teaming picture: who they partner with today + who they sub for.
 */
export function SubawardsPanel({ name, uei }: { name: string; uei?: string | null }) {
    const [asSub, setAsSub] = useState<Relationship[] | null>(null);
    const [asPrime, setAsPrime] = useState<Relationship[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!name) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({ name });
                if (uei) q.set("uei", uei);
                // Two parallel calls — one per direction.
                const [sub, prime] = await Promise.all([
                    fetch(`/api/intelligence/subawards?${q.toString()}&direction=as_sub`).then(r => r.ok ? r.json() : null),
                    fetch(`/api/intelligence/subawards?${q.toString()}&direction=as_prime`).then(r => r.ok ? r.json() : null),
                ]);
                if (!cancelled) {
                    setAsSub((sub?.relationships as Relationship[] | undefined) || []);
                    setAsPrime((prime?.relationships as Relationship[] | undefined) || []);
                    setLoading(false);
                }
            } catch { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [name, uei]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }

    const hasData = (asSub && asSub.length > 0) || (asPrime && asPrime.length > 0);
    if (!hasData) return null;   // Hide entirely when no teaming history exists.

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm">Teaming Relationships</h3>
                <span className="ml-auto text-[9px] uppercase tracking-widest text-stone-400">Subawards · USASpending.gov</span>
            </div>

            {/* As sub: primes this company has sub'd under. Good signal of who they know. */}
            {asSub && asSub.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                        Primes they sub for <span className="ml-1 text-stone-400 font-normal">({asSub.length})</span>
                    </p>
                    <div className="space-y-1">
                        {asSub.slice(0, 6).map((r, i) => (
                            <RelationshipRow key={`sub-${i}`} rel={r} variant="sub" />
                        ))}
                    </div>
                </div>
            )}

            {/* As prime: subs this company has hired. Good signal of who teams under them. */}
            {asPrime && asPrime.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                        Subs they hire <span className="ml-1 text-stone-400 font-normal">({asPrime.length})</span>
                    </p>
                    <div className="space-y-1">
                        {asPrime.slice(0, 6).map((r, i) => (
                            <RelationshipRow key={`prime-${i}`} rel={r} variant="prime" />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function RelationshipRow({ rel, variant }: { rel: Relationship; variant: "sub" | "prime" }) {
    return (
        <div className={clsx(
            "flex items-center gap-3 p-2 rounded-lg",
            variant === "sub" ? "bg-blue-50 border border-blue-100" : "bg-emerald-50 border border-emerald-100",
        )}>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-stone-800 truncate">{rel.partner}</p>
                <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-0.5">
                    <span className="font-bold">{rel.sub_count} subaward{rel.sub_count === 1 ? "" : "s"}</span>
                    {rel.primary_agency && (<><span>·</span><span className="truncate">{rel.primary_agency}</span></>)}
                </div>
            </div>
            <div className="flex-shrink-0 text-right">
                <p className="text-xs font-bold text-emerald-700">{fmt(rel.total_value)}</p>
                {rel.last_date && (
                    <p className="text-[10px] text-stone-400 inline-flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {new Date(rel.last_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </p>
                )}
            </div>
        </div>
    );
}
