"use client";

import { fmtCurrency } from "@/lib/display-helpers";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    Briefcase, Search, Loader2, ExternalLink, Filter, ChevronDown,
    Shield, Clock, MapPin, DollarSign,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Opp {
    notice_id: string;
    title: string;
    agency: string;
    naics_code: string;
    set_aside_code: string;
    notice_type: string;
    response_deadline: string;
    estimated_value: number;
    place_of_performance_state: string;
    status: string;
    veteran_relevance_flag: boolean;
    small_business_relevance_flag: boolean;
    wosb_relevance_flag: boolean;
    sources_sought_flag: boolean;
}

export default function AdminOpportunities() {
    const [opps, setOpps] = useState<Opp[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ACTIVE");
    const [naicsFilter, setNaicsFilter] = useState("");
    const [setAsideFilter, setSetAsideFilter] = useState("");
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    const loadOpps = async () => {
        setLoading(true);
        let query = supabase.from("opportunities")
            .select("notice_id, title, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, place_of_performance_state, status, veteran_relevance_flag, small_business_relevance_flag, wosb_relevance_flag, sources_sought_flag", { count: "exact" })
            .order("posted_date", { ascending: false, nullsFirst: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (statusFilter) query = query.eq("status", statusFilter);
        if (naicsFilter) query = query.eq("naics_code", naicsFilter);
        if (search) query = query.ilike("title", `%${search}%`);
        if (setAsideFilter === "veteran") query = query.eq("veteran_relevance_flag", true);
        else if (setAsideFilter === "wosb") query = query.eq("wosb_relevance_flag", true);
        else if (setAsideFilter === "sb") query = query.eq("small_business_relevance_flag", true);
        else if (setAsideFilter === "sources_sought") query = query.eq("sources_sought_flag", true);

        const { data, count } = await query;
        setOpps((data || []) as Opp[]);
        setTotal(count || 0);
        setLoading(false);
    };

    useEffect(() => { loadOpps(); }, [statusFilter, naicsFilter, setAsideFilter, page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadOpps();
    };

    const fmtCurrency = (n: number) => {
        if (!n) return "";
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
        return `$${n.toLocaleString()}`;
    };

    const statusColors: Record<string, string> = {
        ACTIVE: "bg-emerald-100 text-emerald-700",
        EXPIRING_SOON: "bg-red-100 text-red-700",
        EXPIRED: "bg-stone-200 text-stone-600",
        MARKET_RESEARCH: "bg-violet-100 text-violet-700",
        INTELLIGENCE: "bg-blue-100 text-blue-700",
        AWARDED: "bg-amber-100 text-amber-700",
        DISCOVERED: "bg-stone-100 text-stone-500",
    };

    return (
        <div className="w-full space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold font-typewriter flex items-center gap-2">
                        <Briefcase className="w-5 h-5" /> Opportunities
                    </h1>
                    <p className="text-sm text-stone-500">{total.toLocaleString()} total</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <form onSubmit={handleSearch} className="flex-1 min-w-[200px] relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by title..."
                        className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg text-sm bg-white" />
                </form>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="EXPIRING_SOON">Expiring Soon</option>
                    <option value="MARKET_RESEARCH">Market Research</option>
                    <option value="INTELLIGENCE">Intelligence</option>
                    <option value="AWARDED">Awarded</option>
                    <option value="EXPIRED">Expired</option>
                </select>
                <input value={naicsFilter} onChange={e => setNaicsFilter(e.target.value)}
                    placeholder="NAICS code"
                    className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <select value={setAsideFilter} onChange={e => setSetAsideFilter(e.target.value)}
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">All Set-Asides</option>
                    <option value="veteran">Veteran (SDVOSB/VOSB)</option>
                    <option value="wosb">Women-Owned (WOSB)</option>
                    <option value="sb">Small Business</option>
                    <option value="sources_sought">Sources Sought</option>
                </select>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}</span>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                        className="px-3 py-1 border border-stone-300 rounded-lg disabled:opacity-30 hover:bg-stone-50">Prev</button>
                    <button type="button" onClick={() => setPage(page + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                        className="px-3 py-1 border border-stone-300 rounded-lg disabled:opacity-30 hover:bg-stone-50">Next</button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
            ) : (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-stone-100 text-[10px] font-typewriter text-stone-400 uppercase">
                                    <th className="text-left px-4 py-2.5">Opportunity</th>
                                    <th className="text-center px-3 py-2.5">Status</th>
                                    <th className="text-center px-3 py-2.5">NAICS</th>
                                    <th className="text-center px-3 py-2.5">Set-Aside</th>
                                    <th className="text-center px-3 py-2.5">Value</th>
                                    <th className="text-center px-3 py-2.5">Deadline</th>
                                    <th className="text-center px-3 py-2.5">State</th>
                                    <th className="text-center px-3 py-2.5">Flags</th>
                                    <th className="px-3 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                                {opps.map(o => (
                                    <tr key={o.notice_id} className="hover:bg-stone-50/50">
                                        <td className="px-4 py-2.5 max-w-xs">
                                            <p className="font-medium text-stone-900 truncate">{o.title}</p>
                                            <p className="text-[10px] text-stone-400 truncate">{o.agency}</p>
                                        </td>
                                        <td className="text-center px-3">
                                            <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded uppercase", statusColors[o.status] || "bg-stone-100 text-stone-500")}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td className="text-center px-3 text-xs font-mono text-stone-600">{o.naics_code || "—"}</td>
                                        <td className="text-center px-3 text-[10px] text-stone-600 max-w-[120px] truncate">{o.set_aside_code || "—"}</td>
                                        <td className="text-center px-3 text-xs font-bold text-emerald-600">{fmtCurrency(o.estimated_value)}</td>
                                        <td className="text-center px-3 text-xs text-stone-500">
                                            {o.response_deadline ? new Date(o.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                                        </td>
                                        <td className="text-center px-3 text-xs text-stone-500">{o.place_of_performance_state || "—"}</td>
                                        <td className="text-center px-3">
                                            <div className="flex gap-0.5 justify-center">
                                                {o.veteran_relevance_flag && <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded">VET</span>}
                                                {o.wosb_relevance_flag && <span className="text-[8px] bg-pink-100 text-pink-700 px-1 rounded">WOSB</span>}
                                                {o.small_business_relevance_flag && !o.veteran_relevance_flag && !o.wosb_relevance_flag && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">SB</span>}
                                                {o.sources_sought_flag && <span className="text-[8px] bg-violet-100 text-violet-700 px-1 rounded">SS</span>}
                                            </div>
                                        </td>
                                        <td className="px-3">
                                            <a href={`https://sam.gov/opp/${o.notice_id}/view`} target="_blank" rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800"><ExternalLink className="w-3.5 h-3.5" /></a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
