"use client";

import React, { useState } from "react";
import { LayoutGrid, Target, Plus, MoreHorizontal, Briefcase, Calendar, Clock, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

import { createClient } from "@supabase/supabase-js";

const COLUMNS = [
    { id: "Identified", title: "Identified", description: "Initial matches" },
    { id: "Qualified", title: "Qualified", description: "Vetted & capable" },
    { id: "Capture", title: "Capture", description: "Active pursuit & teaming" },
    { id: "Proposed", title: "Proposed", description: "Submitted response" },
    { id: "Won", title: "Won", description: "Awarded contract" }
];

export default function PipelinePage() {
    const [pipeline, setPipeline] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const handleAddPursuit = async () => {
        const oppId = window.prompt("Enter valid Opportunity ID (UUID):");
        if (!oppId) return;
        const contractorId = window.prompt("Enter valid Contractor ID (UUID):");
        if (!contractorId) return;

        try {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            await supabase.from("capture_outcomes").insert({
                opportunity_id: oppId,
                contractor_id: contractorId,
                status: "Identified"
            });

            window.location.reload();
        } catch (e) {
            alert("Failed to created pursuit. Make sure UUIDs are perfectly valid.");
        }
    };

    React.useEffect(() => {
        async function fetchPipeline() {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

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

            if (data && !error) {
                const formatted = data.map((row: any) => ({
                    id: `${row.opportunity_id}-${row.contractor_id}`,
                    title: row.opportunities?.title || "Unknown Title",
                    agency: row.opportunities?.agencies?.sub_tier || row.opportunities?.agencies?.department || "Unknown Agency",
                    value: row.opportunities?.award_amount ? `$${(row.opportunities.award_amount / 1000000).toFixed(1)}M` : "TBD",
                    deadline: row.opportunities?.response_deadline || "TBD",
                    status: row.won ? "Won" : row.submitted ? "Proposed" : row.status || "Identified",
                    contractor: row.contractors?.company_name || "Unknown Contractor",
                    pwin: 50
                }));
                setPipeline(formatted);
            }
            setLoading(false);
        }
        fetchPipeline();
    }, []);

    const totalValue = pipeline.reduce((acc, curr) => {
        const val = parseFloat(curr.value.replace('$', '').replace('M', '')) || 0;
        return acc + val;
    }, 0).toFixed(1);
    const activePursuits = pipeline.length;
    const avgWinProb = 68;
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
                        onClick={handleAddPursuit}
                        className="bg-black text-white px-5 py-2.5 rounded-full font-typewriter text-sm font-bold flex items-center hover:bg-stone-800 transition-colors shadow-md">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Pursuit
                    </button>
                </header>

                {/* KPI Summary */}
                <div className="grid grid-cols-4 gap-6 mb-8">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1">Total Pipeline Value</p>
                        <p className="text-2xl font-bold font-mono">${totalValue}M</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1">Active Pursuits</p>
                        <p className="text-2xl font-bold font-mono">{activePursuits}</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-[10px] font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1">Avg Win Probability</p>
                        <p className="text-2xl font-bold font-mono text-green-600">{avgWinProb}%</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-stone-900 to-black text-white">
                        <p className="text-[10px] font-typewriter font-bold text-stone-400 uppercase tracking-widest mb-1">Total Won (YTD)</p>
                        <p className="text-2xl font-bold font-mono text-white">${totalWon}M</p>
                    </div>
                </div>

                {loading && <p className="text-stone-500 text-center py-10 font-typewriter">Scanning pipeline records...</p>}
                {!loading && (
                    <div className="flex-1 overflow-x-auto custom-scrollbar pb-6 flex space-x-6">
                        {/* Kanban Board Layout */}
                        {COLUMNS.map(column => {
                            const colItems = pipeline.filter(item => item.status === column.id);
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
                                            <div key={item.id} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md hover:border-black transition-all cursor-grab active:cursor-grabbing group">

                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="bg-black text-white text-[9px] font-typewriter uppercase tracking-widest px-2 py-0.5 rounded">
                                                        {item.contractor}
                                                    </span>
                                                    <MoreHorizontal className="w-4 h-4 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>

                                                <h4 className="font-bold text-black text-sm leading-tight mb-1">{item.title}</h4>
                                                <p className="text-xs text-stone-500 mb-4 truncate">{item.agency}</p>

                                                {item.pwin && item.status !== "Won" && (
                                                    <div className="mb-4">
                                                        <div className="flex justify-between text-[10px] font-typewriter mb-1">
                                                            <span className="text-stone-500">PWin Masterguide</span>
                                                            <span className={clsx("font-bold", item.pwin >= 80 ? "text-green-600" : item.pwin >= 50 ? "text-yellow-600" : "text-red-500")}>
                                                                {item.pwin}%
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-stone-100 rounded-full h-1.5 hidden group-hover:block transition-all">
                                                            <div className={clsx("h-1.5 rounded-full", item.pwin >= 80 ? "bg-green-500" : item.pwin >= 50 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${item.pwin}%` }}></div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center pt-3 border-t border-stone-100 mt-2">
                                                    <span className="font-mono font-bold text-sm text-stone-900">{item.value}</span>
                                                    {item.status === 'Won' ? (
                                                        <div className="flex items-center text-green-600 space-x-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-bold font-typewriter uppercase">Awarded</span>
                                                        </div>
                                                    ) : (
                                                        <div className={clsx("flex items-center space-x-1", new Date(item.deadline) < new Date() ? "text-red-500" : "text-stone-400")}>
                                                            <Clock className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-mono">{new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        ))}

                                        {colItems.length === 0 && (
                                            <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-stone-400">
                                                <Target className="w-6 h-6 mb-2 opacity-50" />
                                                <span className="font-typewriter text-[10px] tracking-wider uppercase">Drop Here</span>
                                            </div>
                                        )}
                                    </div>

                                    <button className="mt-2 w-full py-3 border border-stone-200 border-dashed rounded-xl text-stone-500 font-typewriter text-xs flex justify-center items-center hover:bg-white hover:border-black hover:text-black transition-all">
                                        <Plus className="w-3 h-3 mr-1" /> New Pursuit
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                )}
            </div>
        </div >
    );
}
