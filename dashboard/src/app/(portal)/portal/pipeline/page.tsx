"use client";

import { fmtCurrency } from "@/lib/display-helpers";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Layers, Loader2, ExternalLink, Clock, FileText, ChevronDown, Plus, MessageSquare, Save } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Pursuit {
    id: string;
    stage: string;
    priority: string;
    notes: string | null;
    created_at: string;
    stage_changed_at: string | null;
    opportunity: {
        title: string;
        agency: string;
        notice_id: string;
        notice_type: string;
        set_aside_code: string;
        response_deadline: string;
        naics_code: string;
        estimated_value: number;
    };
}

const STAGES = [
    { key: "discovered", label: "Discovered", color: "bg-stone-100", dot: "bg-stone-400", text: "text-stone-700" },
    { key: "researching", label: "Research", color: "bg-blue-50", dot: "bg-blue-500", text: "text-blue-700" },
    { key: "contacted", label: "Contacted", color: "bg-cyan-50", dot: "bg-cyan-500", text: "text-cyan-700" },
    { key: "in_contact", label: "In Contact", color: "bg-indigo-50", dot: "bg-indigo-500", text: "text-indigo-700" },
    { key: "preparing", label: "Preparing Bid", color: "bg-amber-50", dot: "bg-amber-500", text: "text-amber-700" },
    { key: "needs_feedback", label: "Needs Feedback", color: "bg-orange-50", dot: "bg-orange-500", text: "text-orange-700" },
    { key: "submitted", label: "Submitted", color: "bg-violet-50", dot: "bg-violet-500", text: "text-violet-700" },
    { key: "negotiation", label: "Negotiation", color: "bg-pink-50", dot: "bg-pink-500", text: "text-pink-700" },
    { key: "awarded", label: "Won", color: "bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-700" },
    { key: "lost", label: "Lost", color: "bg-red-50", dot: "bg-red-400", text: "text-red-600" },
    { key: "no_bid", label: "No Bid", color: "bg-stone-50", dot: "bg-stone-300", text: "text-stone-500" },
];

export default function PortalPipeline() {
    const [pursuits, setPursuits] = useState<Pursuit[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingNotes, setEditingNotes] = useState<string | null>(null);
    const [noteText, setNoteText] = useState("");
    const [profileId, setProfileId] = useState("");

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: prof } = await supabase.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
            if (!prof) return;
            setProfileId(prof.id);

            const { data } = await supabase
                .from("user_pursuits")
                .select(`id, stage, priority, notes, created_at, stage_changed_at,
                    opportunity:opportunities!inner(title, agency, notice_id, notice_type, set_aside_code, response_deadline, naics_code, estimated_value)`)
                .eq("user_profile_id", prof.id)
                .order("created_at", { ascending: false });

            setPursuits((data || []) as unknown as Pursuit[]);
            setLoading(false);
        })();
    }, []);

    const changeStage = async (pursuitId: string, newStage: string) => {
        await supabase.from("user_pursuits").update({
            stage: newStage,
            stage_changed_at: new Date().toISOString(),
        }).eq("id", pursuitId);
        setPursuits(prev => prev.map(p => p.id === pursuitId ? { ...p, stage: newStage, stage_changed_at: new Date().toISOString() } : p));
    };

    const saveNotes = async (pursuitId: string) => {
        await supabase.from("user_pursuits").update({ notes: noteText }).eq("id", pursuitId);
        setPursuits(prev => prev.map(p => p.id === pursuitId ? { ...p, notes: noteText } : p));
        setEditingNotes(null);
    };

    const fmtCurrency = (n: number) => {
        if (!n) return "";
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
        return `$${n.toLocaleString()}`;
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    // Group by stage
    const byStage = STAGES.map(s => ({
        ...s,
        items: pursuits.filter(p => p.stage === s.key),
    }));

    const activeCount = pursuits.filter(p => !["awarded", "lost", "no_bid"].includes(p.stage)).length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Layers className="w-6 h-6" /> Pipeline
                </h1>
                <p className="text-sm text-stone-500 mt-1">{activeCount} active deals, {pursuits.length} total</p>
            </div>

            {pursuits.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                    <Layers className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm mb-2">No deals in your pipeline yet.</p>
                    <p className="text-stone-400 text-xs">Save opportunities from the Matches tab to start building your pipeline.</p>
                </div>
            )}

            {/* Kanban Board */}
            {pursuits.length > 0 && (
                <div className="overflow-x-auto pb-4 -mx-4 px-4">
                    <div className="flex gap-3 min-w-max">
                        {byStage.filter(s => s.items.length > 0 || ["discovered", "researching", "preparing", "submitted"].includes(s.key)).map(stage => (
                            <div key={stage.key} className={clsx("w-72 rounded-xl border border-stone-200 flex-shrink-0", stage.color)}>
                                {/* Column Header */}
                                <div className="px-3 py-2.5 border-b border-stone-200/50 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={clsx("w-2.5 h-2.5 rounded-full", stage.dot)} />
                                        <span className={clsx("text-xs font-bold uppercase tracking-wide", stage.text)}>{stage.label}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-stone-400 bg-white/60 px-1.5 py-0.5 rounded">{stage.items.length}</span>
                                </div>

                                {/* Cards */}
                                <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                                    {stage.items.map(p => {
                                        const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
                                        const isExpanded = expandedId === p.id;
                                        const daysLeft = opp?.response_deadline ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000) : null;

                                        return (
                                            <div key={p.id} className="bg-white rounded-lg border border-stone-200 shadow-sm">
                                                <button type="button" onClick={() => setExpandedId(isExpanded ? null : p.id)}
                                                    className="w-full text-left p-3">
                                                    <p className="text-xs font-bold text-stone-900 line-clamp-2">{opp?.title || "Deal"}</p>
                                                    <p className="text-[10px] text-stone-500 mt-0.5 truncate">{opp?.agency || ""}</p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        {opp?.estimated_value > 0 && (
                                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{fmtCurrency(opp.estimated_value)}</span>
                                                        )}
                                                        {daysLeft !== null && (
                                                            <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5",
                                                                daysLeft <= 7 ? "text-red-600 bg-red-50" : daysLeft <= 30 ? "text-amber-600 bg-amber-50" : "text-stone-500 bg-stone-50"
                                                            )}>
                                                                <Clock className="w-3 h-3" />{daysLeft <= 0 ? "Expired" : `${daysLeft}d`}
                                                            </span>
                                                        )}
                                                        {opp?.notice_type && (
                                                            <span className="text-[9px] text-stone-400">{opp.notice_type}</span>
                                                        )}
                                                    </div>
                                                </button>

                                                {/* Deal Detail Panel */}
                                                {isExpanded && (
                                                    <div className="border-t border-stone-100 p-3 space-y-3">
                                                        {/* Stage Selector */}
                                                        <div>
                                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase mb-1.5">Move to stage</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {STAGES.map(s => (
                                                                    <button key={s.key} type="button" onClick={() => changeStage(p.id, s.key)}
                                                                        className={clsx("text-[8px] font-bold px-1.5 py-0.5 rounded border transition-colors",
                                                                            p.stage === s.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                                                                        )}>
                                                                        {s.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Details */}
                                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                            {opp?.naics_code && <div><span className="text-stone-400">NAICS</span><br/><span className="font-mono font-bold">{opp.naics_code}</span></div>}
                                                            {opp?.set_aside_code && <div><span className="text-stone-400">Set-Aside</span><br/><span className="font-bold">{opp.set_aside_code.substring(0, 25)}</span></div>}
                                                            {opp?.response_deadline && <div><span className="text-stone-400">Deadline</span><br/><span className="font-bold">{new Date(opp.response_deadline).toLocaleDateString()}</span></div>}
                                                            {opp?.estimated_value > 0 && <div><span className="text-stone-400">Value</span><br/><span className="font-bold text-emerald-600">{fmtCurrency(opp.estimated_value)}</span></div>}
                                                        </div>

                                                        {/* Notes */}
                                                        <div>
                                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase mb-1">Notes</p>
                                                            {editingNotes === p.id ? (
                                                                <div className="space-y-1.5">
                                                                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                                                                        placeholder="Add notes about this deal..."
                                                                        className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs h-20 resize-none" />
                                                                    <div className="flex gap-1.5">
                                                                        <button type="button" onClick={() => saveNotes(p.id)}
                                                                            className="text-[10px] font-bold bg-black text-white px-2 py-1 rounded inline-flex items-center gap-0.5">
                                                                            <Save className="w-3 h-3" /> Save
                                                                        </button>
                                                                        <button type="button" onClick={() => setEditingNotes(null)} className="text-[10px] text-stone-400">Cancel</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <button type="button" onClick={() => { setEditingNotes(p.id); setNoteText(p.notes || ""); }}
                                                                    className="w-full text-left text-xs text-stone-500 bg-stone-50 rounded-lg px-2 py-1.5 hover:bg-stone-100 transition-colors">
                                                                    {p.notes || "Click to add notes..."}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* SAM Link */}
                                                        {opp?.notice_id && (
                                                            <a href={`https://sam.gov/opp/${opp.notice_id}/view`} target="_blank" rel="noopener noreferrer"
                                                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                                                <ExternalLink className="w-3 h-3" /> View on SAM.gov
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
