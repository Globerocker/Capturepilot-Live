"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Target, Loader2, ExternalLink, Users, RefreshCw } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ClientMatch {
    company_name: string;
    profile_id: string;
    total_matches: number;
    hot: number;
    warm: number;
    cold: number;
    top_match_title: string;
    top_match_score: number;
}

interface MatchDetail {
    id: string;
    score: number;
    classification: string;
    is_saved: boolean;
    score_breakdown: Record<string, number>;
    opp_title: string;
    opp_agency: string;
    opp_naics: string;
    opp_deadline: string;
    opp_notice_id: string;
}

export default function AdminMatches() {
    const [clients, setClients] = useState<ClientMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState<string | null>(null);
    const [matches, setMatches] = useState<MatchDetail[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [rescoring, setRescoring] = useState(false);

    useEffect(() => {
        (async () => {
            const { data: profiles } = await supabase
                .from("user_profiles")
                .select("id, company_name")
                .in("account_type", ["consulting", "self_service"]);

            if (!profiles) { setLoading(false); return; }

            const clientMatches: ClientMatch[] = [];
            for (const p of profiles) {
                const { data: matchData } = await supabase
                    .from("user_matches")
                    .select("score, classification")
                    .eq("user_profile_id", p.id)
                    .order("score", { ascending: false })
                    .limit(500);

                const m = matchData || [];
                clientMatches.push({
                    company_name: p.company_name,
                    profile_id: p.id,
                    total_matches: m.length,
                    hot: m.filter(x => x.classification === "HOT").length,
                    warm: m.filter(x => x.classification === "WARM").length,
                    cold: m.filter(x => x.classification === "COLD").length,
                    top_match_title: "",
                    top_match_score: m[0]?.score || 0,
                });
            }

            setClients(clientMatches.sort((a, b) => b.total_matches - a.total_matches));
            setLoading(false);
        })();
    }, []);

    const loadMatches = async (profileId: string) => {
        setSelectedClient(profileId);
        setMatchesLoading(true);

        const { data } = await supabase
            .from("user_matches")
            .select(`
                id, score, classification, is_saved, score_breakdown,
                opportunity:opportunities!inner(notice_id, title, agency, naics_code, response_deadline)
            `)
            .eq("user_profile_id", profileId)
            .order("score", { ascending: false })
            .limit(100);

        setMatches((data || []).map((m: Record<string, unknown>) => {
            const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Record<string, unknown>;
            return {
                id: String(m.id),
                score: Number(m.score),
                classification: String(m.classification),
                is_saved: Boolean(m.is_saved),
                score_breakdown: (m.score_breakdown || {}) as Record<string, number>,
                opp_title: String(opp?.title || ""),
                opp_agency: String(opp?.agency || ""),
                opp_naics: String(opp?.naics_code || ""),
                opp_deadline: String(opp?.response_deadline || ""),
                opp_notice_id: String(opp?.notice_id || ""),
            };
        }));
        setMatchesLoading(false);
    };

    const handleRescore = async () => {
        setRescoring(true);
        await fetch("/api/matches/refresh", { method: "POST" }).catch(() => {});
        setRescoring(false);
        // Reload
        if (selectedClient) loadMatches(selectedClient);
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    return (
        <div className="w-full space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Target className="w-5 h-5" /> Match Overview
                    </h1>
                    <p className="text-sm text-stone-500">{clients.reduce((s, c) => s + c.total_matches, 0).toLocaleString()} total matches across {clients.length} clients</p>
                </div>
                <button type="button" onClick={handleRescore} disabled={rescoring}
                    className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                    <RefreshCw className={clsx("w-4 h-4", rescoring && "animate-spin")} /> {rescoring ? "Scoring..." : "Re-Score All"}
                </button>
            </div>

            {/* Client match summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {clients.map(c => (
                    <button key={c.profile_id} type="button" onClick={() => loadMatches(c.profile_id)}
                        className={clsx("bg-white border rounded-xl p-4 text-left hover:border-stone-300 transition-colors",
                            selectedClient === c.profile_id ? "border-black ring-1 ring-black" : "border-stone-200"
                        )}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="font-bold text-sm">{c.company_name}</p>
                            <span className="text-xs text-stone-400">{c.total_matches} matches</span>
                        </div>
                        <div className="flex gap-2">
                            {c.hot > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded">{c.hot} HOT</span>}
                            {c.warm > 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{c.warm} WARM</span>}
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{c.cold} COLD</span>
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">Top score: {Math.round(c.top_match_score * 100)}%</p>
                    </button>
                ))}
            </div>

            {/* Match detail table */}
            {selectedClient && (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                        <h2 className="font-bold text-sm">Matches for {clients.find(c => c.profile_id === selectedClient)?.company_name}</h2>
                        <span className="text-xs text-stone-400">{matches.length} results</span>
                    </div>
                    {matchesLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
                    ) : (
                        <div className="overflow-x-auto max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-stone-50">
                                    <tr className="border-b border-stone-100 text-[10px] text-stone-400 uppercase">
                                        <th className="text-center px-3 py-2">Score</th>
                                        <th className="text-center px-3 py-2">Class</th>
                                        <th className="text-left px-3 py-2">Opportunity</th>
                                        <th className="text-center px-3 py-2">NAICS</th>
                                        <th className="text-center px-3 py-2">Deadline</th>
                                        <th className="text-left px-3 py-2">Breakdown</th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-50">
                                    {matches.map(m => (
                                        <tr key={m.id} className="hover:bg-stone-50/50">
                                            <td className="text-center px-3 py-2">
                                                <span className={clsx("text-sm font-black",
                                                    m.score >= 0.7 ? "text-emerald-600" : m.score >= 0.5 ? "text-amber-600" : "text-blue-600"
                                                )}>{Math.round(m.score * 100)}</span>
                                            </td>
                                            <td className="text-center px-3 py-2">
                                                <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                                                    m.classification === "HOT" ? "bg-red-100 text-red-700" :
                                                    m.classification === "WARM" ? "bg-amber-100 text-amber-700" :
                                                    "bg-blue-100 text-blue-700"
                                                )}>{m.classification}</span>
                                            </td>
                                            <td className="px-3 py-2 max-w-xs">
                                                <p className="text-xs font-medium truncate">{m.opp_title}</p>
                                                <p className="text-[10px] text-stone-400 truncate">{m.opp_agency}</p>
                                            </td>
                                            <td className="text-center px-3 py-2 text-xs font-mono text-stone-500">{m.opp_naics}</td>
                                            <td className="text-center px-3 py-2 text-xs text-stone-500">
                                                {m.opp_deadline ? new Date(m.opp_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex gap-0.5 flex-wrap">
                                                    {Object.entries(m.score_breakdown || {}).map(([k, v]) => (
                                                        <span key={k} className={clsx("text-[8px] px-1 py-0.5 rounded",
                                                            v >= 0.7 ? "bg-emerald-50 text-emerald-600" :
                                                            v >= 0.4 ? "bg-amber-50 text-amber-600" :
                                                            "bg-stone-50 text-stone-400"
                                                        )}>{k}:{Math.round(v * 100)}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <a href={`https://sam.gov/opp/${m.opp_notice_id}/view`} target="_blank" rel="noopener noreferrer"
                                                    className="text-blue-600"><ExternalLink className="w-3 h-3" /></a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
