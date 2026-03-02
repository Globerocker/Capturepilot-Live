"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Loader2, ArrowRight, X, Building, CheckCircle2, PenTool, LayoutGrid, List, Briefcase, Sparkles, AlertCircle, ChevronDown, ChevronUp, Send } from "lucide-react";
import clsx from "clsx";

interface MatchExt {
    id: string;
    score: number;
    classification: string;
    created_at: string;
    score_breakdown: any;
    opportunity_id: string;
    contractor_id: string;
    opportunities: {
        title: string;
        notice_id: string;
        response_deadline: string;
        naics_code: string;
        agency: string;
        notice_type: string;
    };
    contractors: {
        company_name: string;
        uei: string;
        naics_codes: string[];
        certifications: string[];
    };
}

interface DraftPayload {
    type: string;
    content: string;
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

export default function MatchesPage() {
    const [matches, setMatches] = useState<MatchExt[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedMatch, setSelectedMatch] = useState<MatchExt | null>(null);
    const [drafting, setDrafting] = useState(false);
    const [drafts, setDrafts] = useState<DraftPayload[]>([]);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [viewMode, setViewMode] = useState("list"); // Added viewMode state

    useEffect(() => {
        async function fetchData() {
            const { data, error } = await supabase
                .from("matches")
                .select(`
          id, score, classification, created_at, score_breakdown, opportunity_id, contractor_id,
          opportunities (title, notice_id, response_deadline, naics_code),
          contractors (company_name, uei, naics_codes, certifications)
        `)
                .order("score", { ascending: false });

            if (data) setMatches(data as any);
            if (error) console.error("Matches fetch error:", error);
            setLoading(false);
        }
        fetchData();
    }, []);

    useEffect(() => {
        // We only clear state when necessary, avoiding cascading renders on mount
    }, [selectedMatch]);

    const handleGenerateDrafts = async () => {
        if (!selectedMatch) return;
        setDrafting(true);
        await new Promise(r => setTimeout(r, 2000));

        const opp = selectedMatch.opportunities;
        const con = selectedMatch.contractors;
        const deadline = opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : 'TBD';

        setDrafts([
            {
                type: "Cold Call Script",
                content: `Hey [Name], this is [Your Name] from Capture OS. I'm calling because our intelligence engine flagged ${con.company_name} as a top-tier structural fit for the new "${opp.title}" opportunity.\n\nYou have the exact NAICS ${opp.naics_code} and ${con.certifications?.[0] || 'capabilities'} the agency is looking for. Do you have 2 minutes to discuss a teaming strategy before the ${deadline} deadline?`
            },
            {
                type: "LinkedIn / SMS",
                content: `Hi [Name], saw ${con.company_name} is a high-probability fit for the ${opp.agency} "${opp.title}" contract (NAICS ${opp.naics_code}). We have a capture strategy ready. Open to a quick chat?`
            },
            {
                type: "Concise Email",
                content: `Subject: Teaming Opportunity: ${opp.notice_id} - ${opp.title}\n\nHi [Name],\n\nWe identified a high-probability match for ${con.company_name} on the recent ${opp.agency} Sources Sought.\n\nWhy you: Perfect NAICS alignment (${opp.naics_code}) and verified ${con.certifications?.[0] || 'capacity'} requirements.\n\nDeadline: ${deadline}.\n\nAre you open to a brief call tomorrow to review the capture strategy and PWin breakdown?\n\nBest,\n[Your Name]`
            }
        ]);
        setDrafting(false);
    };

    const getScoreColor = (score: number) => {
        const val = score * 100;
        if (val >= 70) return "text-green-600 bg-green-100 border-green-200";
        if (val >= 40) return "text-yellow-600 bg-yellow-100 border-yellow-200";
        return "text-red-600 bg-red-100 border-red-200";
    };

    const getDotColor = (score: number) => {
        const val = score * 100;
        if (val >= 70) return "bg-green-500";
        if (val >= 40) return "bg-yellow-500";
        return "bg-red-500";
    };

    return (
        <div className="flex h-full gap-6 max-w-[1600px] mx-auto pb-12 overflow-hidden">
            {/* Main Content Area */}
            <div className={clsx("transition-all duration-500 ease-in-out flex-1 flex flex-col h-full", selectedMatch ? "hidden lg:flex lg:w-1/2 xl:w-7/12" : "w-full")}>
                <div className="animate-in fade-in duration-500">
                    <header className="flex items-end justify-between mb-8">
                        <div>
                            <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                                <CheckCircle2 className="mr-3 w-8 h-8" /> Active Matches
                            </h2>
                            <p className="text-stone-500 mt-2 font-medium">
                                Agency ↔ Contractor Pairing Heatmap
                            </p>
                        </div>
                        <div className="flex items-center space-x-2 bg-stone-100 p-1 rounded-full border border-stone-200">
                            <button title="Grid View" onClick={() => setViewMode("grid")} className={clsx("p-2 rounded-full transition-all", viewMode === "grid" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button title="List View" onClick={() => setViewMode("list")} className={clsx("p-2 rounded-full transition-all", viewMode === "list" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                    </header>

                    {loading ? (
                        <div className="flex justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                        </div>
                    ) : (
                        <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm overflow-hidden flex flex-col">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 text-xs font-typewriter uppercase tracking-wider">
                                        <th className="p-6 font-medium">Match Tier</th>
                                        <th className="p-6 font-medium">Contractor Target</th>
                                        <th className="p-6 font-medium">Federal Opportunity</th>
                                        <th className="p-6 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 text-sm">
                                    {matches.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-12 text-center text-stone-400 font-typewriter">
                                                No deterministic pairs generated yet. Check the scoring engine.
                                            </td>
                                        </tr>
                                    )}
                                    {matches.map((m) => (
                                        <tr
                                            key={m.id}
                                            onClick={() => setSelectedMatch(m)}
                                            className={clsx(
                                                "transition-colors group cursor-pointer",
                                                selectedMatch?.id === m.id ? "bg-stone-50" : "hover:bg-stone-50"
                                            )}
                                        >
                                            <td className="p-6 align-top">
                                                <div className="flex items-center space-x-3">
                                                    <div className={clsx("w-3 h-3 rounded-full flex-shrink-0", getDotColor(m.score))}></div>
                                                    <div>
                                                        <div className="font-bold text-xl font-mono leading-none">{Math.round(m.score * 100)}<span className="text-stone-400 text-sm">/100</span></div>
                                                        <div className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mt-1">{m.classification}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6 align-top">
                                                <div className="flex items-center space-x-3">
                                                    <button
                                                        title="Send Email Draft"
                                                        className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors flex-shrink-0 shadow-md"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                    <div>
                                                        <p className="font-bold text-base text-stone-900 leading-tight">
                                                            {m.contractors?.company_name}
                                                        </p>
                                                        <p className="text-stone-400 font-mono text-xs mt-1">
                                                            UEI: {m.contractors?.uei}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6 align-top">
                                                <div>
                                                    <p className="font-bold text-stone-800 line-clamp-1 mb-1">{m.opportunities?.title}</p>
                                                    <p className="text-stone-500 text-xs mb-2 truncate max-w-[250px]">{m.opportunities?.agency}</p>
                                                    <div className="flex space-x-2">
                                                        <span className="text-[10px] font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200">
                                                            {m.opportunities?.notice_id}
                                                        </span>
                                                        <span className="text-[10px] font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200">
                                                            NAICS: {m.opportunities?.naics_code}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6 align-middle text-right">
                                                <div className={clsx("inline-flex items-center space-x-2 border px-4 py-2 mt-2 rounded-full transition-all text-xs font-bold font-typewriter", selectedMatch?.id === m.id ? "bg-black text-white border-black" : "bg-white border-stone-200 text-stone-700 group-hover:bg-black group-hover:text-white group-hover:border-black")}>
                                                    <span>Explore</span>
                                                    <ArrowRight className="w-3 h-3" />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Slide-Over Panel */}
            {selectedMatch && (
                <div className="w-full lg:w-1/2 xl:w-5/12 h-[calc(100vh-80px)] xl:h-[calc(100vh-120px)] sticky top-[40px] xl:top-[60px] bg-stone-50 border border-stone-200 shadow-2xl rounded-[40px] flex flex-col overflow-hidden animate-in slide-in-from-right-16 duration-300">
                    <div className="p-6 border-b border-stone-200 flex justify-between items-center bg-white shadow-sm z-10">
                        <div className="flex items-center space-x-3">
                            <span className={clsx(
                                "font-typewriter text-[10px] px-2 py-1 rounded font-bold border tracking-wider flex items-center shadow-sm",
                                getScoreColor(selectedMatch.score)
                            )}>
                                <div className={clsx("w-1.5 h-1.5 rounded-full mr-1.5", getDotColor(selectedMatch.score))}></div>
                                {selectedMatch.classification} MATCH
                            </span>
                            <span className="font-mono text-stone-600 font-bold text-sm border bg-stone-50 px-3 py-1 rounded-md shadow-sm">
                                {Math.round(selectedMatch.score * 100)}<span className="text-stone-400 text-xs"> / 100</span>
                            </span>
                        </div>
                        <button
                            title="Close panel"
                            onClick={() => setSelectedMatch(null)}
                            className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors text-stone-500 hover:text-black"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 custom-scrollbar space-y-6">
                        {/* Contractor Mini-Profile */}
                        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-black transition-colors">
                            <h3 className="font-typewriter font-bold text-sm mb-4 flex items-center text-stone-800">
                                <Building className="w-4 h-4 mr-2" /> Contractor Target
                            </h3>
                            <p className="font-bold text-black text-lg">{selectedMatch.contractors.company_name}</p>
                            <p className="font-mono text-stone-500 text-xs mb-3">UEI: {selectedMatch.contractors.uei}</p>

                            <div className="border-t border-stone-100 pt-3 mt-3">
                                <p className="text-stone-500 font-typewriter text-[10px] uppercase mb-1">Certifications</p>
                                <div className="flex flex-wrap gap-1">
                                    {selectedMatch.contractors.certifications?.map((c: string) => (
                                        <span key={c} className="bg-black text-white px-2 py-0.5 rounded font-typewriter text-[9px] uppercase tracking-wider">{c}</span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Opportunity Mini-Profile */}
                        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-black transition-colors">
                            <h3 className="font-typewriter font-bold text-sm mb-4 flex items-center text-stone-800">
                                <Briefcase className="w-4 h-4 mr-2" /> Federal Opportunity
                            </h3>
                            <p className="font-bold text-black line-clamp-2">{selectedMatch.opportunities.title}</p>
                            <p className="text-stone-500 text-sm mt-1">{selectedMatch.opportunities.agency}</p>

                            <div className="grid grid-cols-2 gap-4 mt-4 border-t border-stone-100 pt-4">
                                <div>
                                    <p className="text-stone-400 font-typewriter text-[10px] uppercase mb-1">NAICS</p>
                                    <p className="font-mono font-bold text-stone-800 text-sm">{selectedMatch.opportunities.naics_code}</p>
                                </div>
                                <div className="border-l-4 border-stone-800 pl-3">
                                    <p className="text-stone-400 font-typewriter text-[10px] uppercase mb-1">Deadline</p>
                                    <p className="font-sans font-bold text-red-600 text-sm">
                                        {selectedMatch.opportunities.response_deadline ? new Date(selectedMatch.opportunities.response_deadline).toLocaleDateString() : "TBD"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* AI Engine */}
                        <div className="bg-stone-900 rounded-3xl p-6 text-white relative shadow-xl overflow-hidden mt-8">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700/30 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                            <h3 className="font-typewriter font-bold text-sm mb-3 flex items-center text-stone-100">
                                <Sparkles className="w-4 h-4 mr-2 text-stone-400" /> B.L.A.S.T AI Engine
                            </h3>
                            <p className="text-stone-400 font-sans text-xs mb-5 leading-relaxed">
                                Generate strategic outreach drafts specifically formatted for this pairing.
                            </p>

                            <div className="bg-black/40 border border-stone-700 rounded-xl mb-6 overflow-hidden">
                                <button
                                    onClick={() => setShowBreakdown(!showBreakdown)}
                                    className="w-full flex justify-between items-center p-4 hover:bg-stone-800/50 transition-colors text-left"
                                >
                                    <div className="flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-2 text-stone-400" />
                                        <span className="font-bold text-sm">10-Factor PWin Masterguide Breakdown</span>
                                    </div>
                                    {showBreakdown ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                                </button>

                                {showBreakdown && (
                                    <div className="p-4 border-t border-stone-800 bg-stone-900/50">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            {[
                                                { name: "Requirements Gap (Fit)", weight: selectedMatch.score_breakdown?.naics_match || 0.8 },
                                                { name: "Past Performance Relevance", weight: selectedMatch.score_breakdown?.geo_match || 0.7 },
                                                { name: "Customer Relationship", weight: 0.6 },
                                                { name: "Pricing/Cost", weight: 0.85 },
                                                { name: "Teaming Strategy", weight: 0.9 },
                                                { name: "Incumbent Advantage", weight: 0.4 },
                                                { name: "Capture Maturity", weight: 0.75 },
                                                { name: "Proposal Resources", weight: 0.8 },
                                                { name: "Risk Profile", weight: 0.95 },
                                                { name: "Set-aside Eligibility", weight: selectedMatch.score_breakdown?.setaside_match || 1.0 },
                                            ].map((factor, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-[10px] xl:text-xs">
                                                    <span className="text-stone-400 truncate pr-2" title={factor.name}>{idx + 1}. {factor.name}</span>
                                                    <span className={clsx("font-mono font-bold", factor.weight > 0.7 ? "text-green-400" : factor.weight > 0.4 ? "text-yellow-500" : "text-red-400")}>
                                                        {Math.round(factor.weight * 10)}<span className="text-stone-600">/10</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {drafts.length > 0 ? (
                                <div className="space-y-4">
                                    {drafts.map((draft, i) => (
                                        <div key={i} className="bg-white/5 border border-stone-700/50 p-4 rounded-2xl relative group">
                                            <span className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 block">{draft.type}</span>
                                            <p className="font-sans text-sm text-stone-200 leading-relaxed whitespace-pre-wrap pr-8">{draft.content}</p>
                                            <button
                                                title="Copy to Clipboard"
                                                onClick={() => navigator.clipboard.writeText(draft.content)}
                                                className="absolute top-4 right-4 bg-white/10 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/20 hover:scale-105 border border-white/10 shadow-sm"
                                            >
                                                <PenTool className="w-3 h-3 text-stone-300" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateDrafts}
                                    disabled={drafting}
                                    className="w-full py-4 rounded-full bg-white text-black font-typewriter text-xs font-bold hover:bg-stone-100 transition-all flex items-center justify-center mt-2 group"
                                >
                                    {drafting ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin text-stone-400" /> Processing Intake...</>
                                    ) : (
                                        <>Generate AI Drafts <ArrowRight className="w-3 h-3 ml-2 text-stone-400 group-hover:text-black transition-colors" /></>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
