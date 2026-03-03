"use client";

import { useState, useEffect } from "react";
import { Target, Plus, Briefcase, Clock, CheckCircle2, ChevronLeft, ChevronRight, X, Search, Loader2 } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

const COLUMNS = [
    { id: "Identified", title: "Identified", description: "Initial matches" },
    { id: "Qualified", title: "Qualified", description: "Vetted & capable" },
    { id: "Capture", title: "Capture", description: "Active pursuit & teaming" },
    { id: "Proposed", title: "Proposed", description: "Submitted response" },
    { id: "Won", title: "Won", description: "Awarded contract" }
];

const STAGE_ORDER = COLUMNS.map(c => c.id);

interface PipelineItem {
    id: string;
    opportunity_id: string;
    contractor_id: string;
    title: string;
    agency: string;
    value: string;
    deadline: string;
    status: string;
    contractor: string;
    pwin: number;
}

export default function PipelinePage() {
    const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);

    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const { data, error } = await supabase
                .from("capture_outcomes")
                .select(`
                    opportunity_id,
                    contractor_id,
                    status,
                    won,
                    submitted,
                    opportunities:opportunity_id (
                        title,
                        award_amount,
                        response_deadline,
                        agencies (
                            department,
                            sub_tier
                        )
                    ),
                    contractors:contractor_id (
                        company_name
                    )
                `);

            if (cancelled) return;

            if (data && !error) {
                const formatted: PipelineItem[] = (data as unknown as Record<string, unknown>[]).map((row) => {
                    const opp = row.opportunities as Record<string, unknown> | null;
                    const con = row.contractors as Record<string, unknown> | null;
                    const agencies = opp?.agencies as Record<string, string> | null;
                    return {
                        id: `${row.opportunity_id}-${row.contractor_id}`,
                        opportunity_id: row.opportunity_id as string,
                        contractor_id: row.contractor_id as string,
                        title: (opp?.title as string) || "Unknown Title",
                        agency: agencies?.sub_tier || agencies?.department || "Unknown Agency",
                        value: opp?.award_amount ? `$${((opp.award_amount as number) / 1000000).toFixed(1)}M` : "TBD",
                        deadline: (opp?.response_deadline as string) || "TBD",
                        status: row.won ? "Won" : row.submitted ? "Proposed" : (row.status as string) || "Identified",
                        contractor: (con?.company_name as string) || "Unknown Contractor",
                        pwin: 50
                    };
                });
                setPipeline(formatted);
            }
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [refreshKey]);

    const handleAdvanceStage = async (item: PipelineItem, direction: "forward" | "back") => {
        const currentIdx = STAGE_ORDER.indexOf(item.status);
        const newIdx = direction === "forward" ? currentIdx + 1 : currentIdx - 1;
        if (newIdx < 0 || newIdx >= STAGE_ORDER.length) return;

        const newStatus = STAGE_ORDER[newIdx];
        const updates: Record<string, unknown> = { status: newStatus };

        if (newStatus === "Won") {
            updates.won = true;
        } else if (newStatus === "Proposed") {
            updates.submitted = true;
        }
        // Clear flags if moving backwards
        if (direction === "back") {
            if (item.status === "Won") updates.won = false;
            if (item.status === "Proposed") updates.submitted = false;
        }

        const { error } = await supabase
            .from("capture_outcomes")
            .update(updates)
            .eq("opportunity_id", item.opportunity_id)
            .eq("contractor_id", item.contractor_id);

        if (!error) {
            setPipeline(prev => prev.map(p =>
                p.id === item.id ? { ...p, status: newStatus } : p
            ));
        }
    };

    const totalValue = pipeline.reduce((acc, curr) => {
        const val = parseFloat(curr.value.replace('$', '').replace('M', '')) || 0;
        return acc + val;
    }, 0).toFixed(1);
    const activePursuits = pipeline.length;
    const totalWon = pipeline.filter(p => p.status === 'Won').reduce((acc, curr) => {
        const val = parseFloat(curr.value.replace('$', '').replace('M', '')) || 0;
        return acc + val;
    }, 0).toFixed(1);

    return (
        <div className="flex h-full gap-6 max-w-[1600px] mx-auto pb-12 overflow-x-hidden">
            <div className="flex-1 flex flex-col h-full w-full">

                {/* Header */}
                <header className="flex items-end justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                            <Briefcase className="mr-3 w-8 h-8" /> Agency Pipeline
                        </h2>
                        <p className="text-stone-500 mt-2 font-medium">
                            Active GovCon Pursuits across Managed Clients
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="bg-black text-white px-5 py-2.5 rounded-full font-typewriter text-sm font-bold flex items-center hover:bg-stone-800 transition-colors shadow-md">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Pursuit
                    </button>
                </header>

                {/* KPI Summary */}
                <div className="grid grid-cols-3 gap-6 mb-8">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1">Total Pipeline Value</p>
                        <p className="text-2xl font-bold font-mono">${totalValue}M</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1">Active Pursuits</p>
                        <p className="text-2xl font-bold font-mono">{activePursuits}</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-stone-900 to-black text-white">
                        <p className="text-[10px] font-typewriter font-bold text-stone-400 uppercase tracking-widest mb-1">Total Won (YTD)</p>
                        <p className="text-2xl font-bold font-mono text-white">${totalWon}M</p>
                    </div>
                </div>

                {loading && <p className="text-stone-500 text-center py-10 font-typewriter">Scanning pipeline records...</p>}
                {!loading && (
                    <div className="flex-1 overflow-x-auto custom-scrollbar pb-6 flex space-x-6">
                        {COLUMNS.map(column => {
                            const colItems = pipeline.filter(item => item.status === column.id);
                            const colIdx = STAGE_ORDER.indexOf(column.id);
                            return (
                                <div key={column.id} className="w-[320px] shrink-0 flex flex-col bg-stone-50 border border-stone-200 rounded-[32px] p-4">

                                    <div className="flex justify-between items-center mb-4 px-2">
                                        <div>
                                            <h3 className="font-bold font-typewriter text-black">{column.title}</h3>
                                            <p className="text-[10px] text-stone-500 uppercase tracking-wider">{column.description}</p>
                                        </div>
                                        <span className="bg-stone-200 text-stone-700 font-mono text-xs px-2 py-0.5 rounded-full">
                                            {colItems.length}
                                        </span>
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2 pb-4">
                                        {colItems.map(item => (
                                            <div key={item.id} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md hover:border-black transition-all group">

                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="bg-black text-white text-[9px] font-typewriter uppercase tracking-widest px-2 py-0.5 rounded">
                                                        {item.contractor}
                                                    </span>
                                                </div>

                                                <h4 className="font-bold text-black text-sm leading-tight mb-1 line-clamp-2">{item.title}</h4>
                                                <p className="text-xs text-stone-500 mb-3 truncate">{item.agency}</p>

                                                <div className="flex justify-between items-center pt-3 border-t border-stone-100">
                                                    <span className="font-mono font-bold text-sm text-stone-900">{item.value}</span>
                                                    {item.status === 'Won' ? (
                                                        <div className="flex items-center text-green-600 space-x-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-bold font-typewriter uppercase">Awarded</span>
                                                        </div>
                                                    ) : (
                                                        <div className={clsx("flex items-center space-x-1", item.deadline !== "TBD" && new Date(item.deadline) < new Date() ? "text-red-500" : "text-stone-400")}>
                                                            <Clock className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-mono">
                                                                {item.deadline !== "TBD" ? new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "TBD"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Stage Advancement Buttons */}
                                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAdvanceStage(item, "back")}
                                                        disabled={colIdx === 0}
                                                        className="flex items-center text-[10px] font-typewriter font-bold text-stone-400 hover:text-black disabled:opacity-30 disabled:hover:text-stone-400 transition-colors px-2 py-1 rounded-full hover:bg-stone-100"
                                                    >
                                                        <ChevronLeft className="w-3 h-3 mr-0.5" /> Back
                                                    </button>
                                                    <span className="text-[9px] font-typewriter text-stone-300 uppercase">{column.title}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAdvanceStage(item, "forward")}
                                                        disabled={colIdx === STAGE_ORDER.length - 1}
                                                        className="flex items-center text-[10px] font-typewriter font-bold text-stone-400 hover:text-black disabled:opacity-30 disabled:hover:text-stone-400 transition-colors px-2 py-1 rounded-full hover:bg-stone-100"
                                                    >
                                                        Advance <ChevronRight className="w-3 h-3 ml-0.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {colItems.length === 0 && (
                                            <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-stone-400">
                                                <Target className="w-6 h-6 mb-2 opacity-50" />
                                                <span className="font-typewriter text-[10px] tracking-wider uppercase">No Pursuits</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Pursuit Modal */}
            {showAddModal && (
                <AddPursuitModal
                    onClose={() => setShowAddModal(false)}
                    onCreated={() => { setShowAddModal(false); setRefreshKey(k => k + 1); }}
                />
            )}
        </div>
    );
}

function AddPursuitModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [oppSearch, setOppSearch] = useState("");
    const [conSearch, setConSearch] = useState("");
    const [oppResults, setOppResults] = useState<{ id: string; title: string; notice_id: string }[]>([]);
    const [conResults, setConResults] = useState<{ id: string; company_name: string; uei: string }[]>([]);
    const [selectedOpp, setSelectedOpp] = useState<{ id: string; title: string } | null>(null);
    const [selectedCon, setSelectedCon] = useState<{ id: string; company_name: string } | null>(null);
    const [stage, setStage] = useState("Identified");
    const [submitting, setSubmitting] = useState(false);
    const [searchingOpp, setSearchingOpp] = useState(false);
    const [searchingCon, setSearchingCon] = useState(false);

    const searchOpportunities = async (q: string) => {
        if (q.length < 2) { setOppResults([]); return; }
        setSearchingOpp(true);
        const { data } = await supabase
            .from("opportunities")
            .select("id, title, notice_id")
            .or(`title.ilike.%${q}%,notice_id.ilike.%${q}%`)
            .eq("is_archived", false)
            .limit(8);
        setOppResults((data || []) as { id: string; title: string; notice_id: string }[]);
        setSearchingOpp(false);
    };

    const searchContractors = async (q: string) => {
        if (q.length < 2) { setConResults([]); return; }
        setSearchingCon(true);
        const { data } = await supabase
            .from("contractors")
            .select("id, company_name, uei")
            .or(`company_name.ilike.%${q}%,uei.ilike.%${q}%`)
            .limit(8);
        setConResults((data || []) as { id: string; company_name: string; uei: string }[]);
        setSearchingCon(false);
    };

    const handleSubmit = async () => {
        if (!selectedOpp || !selectedCon) return;
        setSubmitting(true);
        const { error } = await supabase.from("capture_outcomes").insert({
            opportunity_id: selectedOpp.id,
            contractor_id: selectedCon.id,
            status: stage
        });
        if (error) {
            alert(`Failed to add pursuit: ${error.message}`);
        } else {
            onCreated();
        }
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold font-typewriter">Add New Pursuit</h3>
                    <button type="button" title="Close" onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-5">
                    {/* Opportunity Search */}
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2 block">Opportunity</label>
                        {selectedOpp ? (
                            <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-4 py-3">
                                <p className="font-bold text-sm line-clamp-1">{selectedOpp.title}</p>
                                <button type="button" title="Clear selection" onClick={() => setSelectedOpp(null)} className="text-stone-400 hover:text-black ml-2">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex items-center bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-black">
                                    <Search className="w-4 h-4 text-stone-400 mr-2" />
                                    <input
                                        type="text"
                                        placeholder="Search by title or notice ID..."
                                        className="bg-transparent border-none outline-none w-full text-sm"
                                        value={oppSearch}
                                        onChange={(e) => { setOppSearch(e.target.value); searchOpportunities(e.target.value); }}
                                    />
                                    {searchingOpp && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
                                </div>
                                {oppResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                                        {oppResults.map(opp => (
                                            <button
                                                key={opp.id}
                                                type="button"
                                                className="w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors border-b border-stone-100 last:border-b-0"
                                                onClick={() => { setSelectedOpp({ id: opp.id, title: opp.title }); setOppSearch(""); setOppResults([]); }}
                                            >
                                                <p className="font-bold text-sm line-clamp-1">{opp.title}</p>
                                                <p className="text-[10px] text-stone-400 font-mono">{opp.notice_id}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Contractor Search */}
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2 block">Contractor</label>
                        {selectedCon ? (
                            <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-4 py-3">
                                <p className="font-bold text-sm">{selectedCon.company_name}</p>
                                <button type="button" title="Clear selection" onClick={() => setSelectedCon(null)} className="text-stone-400 hover:text-black ml-2">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex items-center bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-black">
                                    <Search className="w-4 h-4 text-stone-400 mr-2" />
                                    <input
                                        type="text"
                                        placeholder="Search by company name or UEI..."
                                        className="bg-transparent border-none outline-none w-full text-sm"
                                        value={conSearch}
                                        onChange={(e) => { setConSearch(e.target.value); searchContractors(e.target.value); }}
                                    />
                                    {searchingCon && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
                                </div>
                                {conResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                                        {conResults.map(con => (
                                            <button
                                                key={con.id}
                                                type="button"
                                                className="w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors border-b border-stone-100 last:border-b-0"
                                                onClick={() => { setSelectedCon({ id: con.id, company_name: con.company_name }); setConSearch(""); setConResults([]); }}
                                            >
                                                <p className="font-bold text-sm">{con.company_name}</p>
                                                <p className="text-[10px] text-stone-400 font-mono">{con.uei}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stage Selector */}
                    <div>
                        <label className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2 block">Starting Stage</label>
                        <select
                            title="Stage"
                            value={stage}
                            onChange={(e) => setStage(e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-black"
                        >
                            {COLUMNS.map(c => (
                                <option key={c.id} value={c.id}>{c.title} - {c.description}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        disabled={!selectedOpp || !selectedCon || submitting}
                        onClick={handleSubmit}
                        className="w-full bg-black text-white py-3 rounded-full font-typewriter font-bold text-sm hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        Create Pursuit
                    </button>
                </div>
            </div>
        </div>
    );
}
