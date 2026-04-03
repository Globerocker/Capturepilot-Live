"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Target, Loader2, ChevronDown, Phone, Mail, Globe, Calendar } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Lead {
    id: string;
    company_name: string;
    website: string;
    lead_email: string | null;
    inferred_profile: Record<string, unknown>;
    created_at: string;
}

const STAGES = [
    { key: "New", color: "bg-stone-50", dot: "bg-stone-400", border: "border-stone-200" },
    { key: "Contacted", color: "bg-blue-50", dot: "bg-blue-500", border: "border-blue-200" },
    { key: "First Call Scheduled", color: "bg-cyan-50", dot: "bg-cyan-500", border: "border-cyan-200" },
    { key: "First Call Done", color: "bg-indigo-50", dot: "bg-indigo-500", border: "border-indigo-200" },
    { key: "Second Call Scheduled", color: "bg-violet-50", dot: "bg-violet-500", border: "border-violet-200" },
    { key: "Second Call Done", color: "bg-purple-50", dot: "bg-purple-500", border: "border-purple-200" },
    { key: "Negotiation", color: "bg-amber-50", dot: "bg-amber-500", border: "border-amber-200" },
    { key: "Contract Sent", color: "bg-orange-50", dot: "bg-orange-500", border: "border-orange-200" },
    { key: "Won", color: "bg-emerald-50", dot: "bg-emerald-500", border: "border-emerald-200" },
    { key: "Lost", color: "bg-red-50", dot: "bg-red-400", border: "border-red-200" },
];

export default function AdminSalesPipeline() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from("company_analyses")
                .select("id, company_name, website, lead_email, inferred_profile, created_at")
                .eq("status", "complete")
                .order("created_at", { ascending: false })
                .limit(200);

            setLeads((data || []) as Lead[]);
            setLoading(false);
        })();
    }, []);

    const changeStatus = async (leadId: string, status: string) => {
        const lead = leads.find(l => l.id === leadId);
        if (!lead) return;
        const profile = { ...(lead.inferred_profile || {}), pipeline_status: status };
        await supabase.from("company_analyses").update({ inferred_profile: profile }).eq("id", leadId);
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, inferred_profile: profile } : l));
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    const byStage = STAGES.map(s => ({
        ...s,
        items: leads.filter(l => (l.inferred_profile?.pipeline_status || "New") === s.key),
    }));

    const totalActive = leads.filter(l => !["Won", "Lost"].includes(String(l.inferred_profile?.pipeline_status || "New"))).length;

    return (
        <div className="w-full space-y-5">
            <div>
                <h1 className="text-xl font-bold font-typewriter flex items-center gap-2">
                    <Target className="w-5 h-5" /> Sales Pipeline
                </h1>
                <p className="text-sm text-stone-500">{totalActive} active leads, {leads.length} total</p>
            </div>

            {/* Kanban */}
            <div className="overflow-x-auto pb-4 -mx-4 px-4">
                <div className="flex gap-3 min-w-max">
                    {byStage.map(stage => (
                        <div key={stage.key} className={clsx("w-64 rounded-xl border flex-shrink-0", stage.color, stage.border)}>
                            <div className="px-3 py-2.5 border-b border-stone-200/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={clsx("w-2.5 h-2.5 rounded-full", stage.dot)} />
                                    <span className="text-xs font-bold uppercase tracking-wide text-stone-700">{stage.key}</span>
                                </div>
                                <span className="text-[10px] font-bold text-stone-400 bg-white/60 px-1.5 py-0.5 rounded">{stage.items.length}</span>
                            </div>
                            <div className="p-2 space-y-2 max-h-[450px] overflow-y-auto">
                                {stage.items.map(lead => (
                                    <div key={lead.id} className="bg-white rounded-lg border border-stone-200 shadow-sm p-3">
                                        <p className="text-xs font-bold text-stone-900 truncate">{lead.company_name}</p>
                                        <p className="text-[10px] text-stone-400 truncate mt-0.5">{lead.website?.replace(/^https?:\/\//, "") || ""}</p>
                                        {lead.lead_email && (
                                            <p className="text-[10px] text-blue-600 truncate mt-0.5">{lead.lead_email}</p>
                                        )}
                                        <div className="flex items-center gap-1 mt-2">
                                            <span className="text-[9px] text-stone-400">{new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                        </div>
                                        {/* Stage changer */}
                                        <select
                                            title="Change stage"
                                            value={(lead.inferred_profile?.pipeline_status as string) || "New"}
                                            onChange={e => changeStatus(lead.id, e.target.value)}
                                            className="w-full mt-2 text-[10px] border border-stone-200 rounded px-1.5 py-1 bg-stone-50"
                                        >
                                            {STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
