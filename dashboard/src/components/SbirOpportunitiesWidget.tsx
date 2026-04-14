"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Rocket, ExternalLink } from "lucide-react";

interface Solicitation {
    id: string;
    title: string;
    agency: string;
    program: string;
    close_date: string;
    url: string;
    description: string;
}

interface Props {
    keyword?: string;
    agency?: string;
    limit?: number;
}

export default function SbirOpportunitiesWidget({ keyword, agency, limit = 5 }: Props) {
    const [items, setItems] = useState<Solicitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams();
        if (keyword) params.set("keyword", keyword);
        if (agency) params.set("agency", agency);
        params.set("limit", String(limit));

        fetch(`/api/sbir/search?${params.toString()}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.success) setItems(data.solicitations || []);
                else setError(data.error || "Failed to load");
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [keyword, agency, limit]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Rocket className="w-4 h-4 text-stone-400" />
                    <h3 className="font-bold text-sm">SBIR / STTR Opportunities</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading from SBIR.gov…
                </div>
            </div>
        );
    }

    if (error || items.length === 0) return null;

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-stone-400" />
                    <h3 className="font-bold text-sm">SBIR / STTR Opportunities</h3>
                    <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <Link href="https://www.sbir.gov/solicitations" target="_blank" rel="noopener noreferrer"
                      className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1">
                    View all <ExternalLink className="w-3 h-3" />
                </Link>
            </div>
            <div className="space-y-1.5">
                {items.map((s) => (
                    <a
                        key={s.id}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-xl hover:bg-stone-50 border border-stone-100"
                    >
                        <p className="font-bold text-sm text-black line-clamp-1">{s.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {s.agency && <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{s.agency}</span>}
                            {s.program && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">{s.program}</span>}
                            {s.close_date && <span className="text-[10px] text-stone-400">Closes {new Date(s.close_date).toLocaleDateString()}</span>}
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
