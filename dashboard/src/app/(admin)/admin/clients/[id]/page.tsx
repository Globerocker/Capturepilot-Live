"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ArrowLeft, Building2, Mail, Phone, Globe, Hash, Save, Loader2,
    ListTodo, FileText, Users, Target, Briefcase, Clock, CheckCircle2,
    AlertCircle, Plus, Send, ExternalLink, Layers,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ClientProfile {
    id: string;
    company_name: string;
    contact_name: string;
    contact_phone: string;
    email: string;
    website: string;
    uei: string;
    cage_code: string;
    naics_codes: string[];
    sba_certifications: string[];
    state: string;
    city: string;
    address_line_1: string;
    zip_code: string;
    notes: string;
    client_status: string;
    account_type: string;
    employee_count: string;
    revenue: string;
    target_states: string[];
    created_at: string;
}

export default function ClientDetailPage() {
    const params = useParams();
    const clientId = params.id as string;

    const [profile, setProfile] = useState<ClientProfile | null>(null);
    const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);
    const [docs, setDocs] = useState<Array<Record<string, unknown>>>([]);
    const [matches, setMatches] = useState<Array<Record<string, unknown>>>([]);
    const [pursuits, setPursuits] = useState<Array<Record<string, unknown>>>([]);
    const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
    const [competitors, setCompetitors] = useState<Array<Record<string, unknown>>>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<"overview" | "pipeline" | "tasks" | "docs" | "competitors" | "activity">("overview");

    // Edit form
    const [form, setForm] = useState<Record<string, string>>({});

    // New task form
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", category: "general", notify: true });

    useEffect(() => {
        if (!clientId) return;
        (async () => {
            const [profRes, tasksRes, docsRes, matchesRes, pursuitsRes, activityRes, compRes] = await Promise.all([
                supabase.from("user_profiles").select("*").eq("id", clientId).single(),
                supabase.from("client_tasks").select("*").eq("user_profile_id", clientId).order("created_at", { ascending: false }),
                supabase.from("client_documents").select("*").eq("user_profile_id", clientId).order("created_at", { ascending: false }),
                supabase.from("user_matches").select("score, classification, opportunity:opportunities!inner(title, agency, notice_id, response_deadline, naics_code)").eq("user_profile_id", clientId).order("score", { ascending: false }).limit(20),
                supabase.from("user_pursuits").select("id, stage, priority, notes, opportunity:opportunities!inner(title, agency, notice_id, response_deadline)").eq("user_profile_id", clientId),
                supabase.from("client_activity_log").select("*").eq("user_profile_id", clientId).order("created_at", { ascending: false }).limit(30),
                supabase.from("client_competitors").select("*").eq("user_profile_id", clientId),
            ]);

            if (profRes.data) {
                setProfile(profRes.data as unknown as ClientProfile);
                setForm({
                    company_name: profRes.data.company_name || "",
                    contact_name: profRes.data.contact_name || "",
                    contact_phone: profRes.data.contact_phone || "",
                    email: profRes.data.email || "",
                    website: profRes.data.website || "",
                    uei: profRes.data.uei || "",
                    cage_code: profRes.data.cage_code || "",
                    state: profRes.data.state || "",
                    city: profRes.data.city || "",
                    address_line_1: profRes.data.address_line_1 || "",
                    zip_code: profRes.data.zip_code || "",
                    notes: profRes.data.notes || "",
                    employee_count: String(profRes.data.employee_count || ""),
                    revenue: String(profRes.data.revenue || ""),
                });
            }
            setTasks((tasksRes.data || []) as Array<Record<string, unknown>>);
            setDocs((docsRes.data || []) as Array<Record<string, unknown>>);
            setMatches((matchesRes.data || []) as Array<Record<string, unknown>>);
            setPursuits((pursuitsRes.data || []) as Array<Record<string, unknown>>);
            setActivity((activityRes.data || []) as Array<Record<string, unknown>>);
            setCompetitors((compRes.data || []) as Array<Record<string, unknown>>);
            setLoading(false);
        })();
    }, [clientId]);

    const handleSave = async () => {
        if (!clientId) return;
        setSaving(true);
        await fetch("/api/admin/clients", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_profile_id: clientId, ...form }),
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleCreateTask = async () => {
        await fetch("/api/admin/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_profile_id: clientId, ...taskForm }),
        });
        setShowTaskForm(false);
        setTaskForm({ title: "", description: "", priority: "medium", category: "general", notify: true });
        // Reload tasks
        const { data } = await supabase.from("client_tasks").select("*").eq("user_profile_id", clientId).order("created_at", { ascending: false });
        setTasks((data || []) as Array<Record<string, unknown>>);
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    if (!profile) return <div className="text-center py-12 text-stone-500">Client not found</div>;

    const pendingTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length;
    const warmMatches = matches.filter(m => Number(m.score) >= 0.5).length;

    const TABS = [
        { key: "overview", label: "Overview", icon: Building2 },
        { key: "pipeline", label: "Pipeline", icon: Layers, count: pursuits.length },
        { key: "tasks", label: "Tasks", icon: ListTodo, count: pendingTasks },
        { key: "docs", label: "Documents", icon: FileText, count: docs.length },
        { key: "competitors", label: "Competitors", icon: Users, count: competitors.length },
        { key: "activity", label: "Activity", icon: Clock, count: activity.length },
    ] as const;

    return (
        <div className="w-full space-y-5">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/clients" className="text-stone-400 hover:text-stone-600"><ArrowLeft className="w-5 h-5" /></Link>
                <div className="flex-1">
                    <h1 className="text-xl font-bold font-typewriter">{profile.company_name}</h1>
                    <div className="flex items-center gap-3 text-xs text-stone-500 mt-0.5">
                        {profile.contact_name && <span>{profile.contact_name}</span>}
                        {profile.email && <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" />{profile.email}</span>}
                        {profile.contact_phone && <span className="inline-flex items-center gap-0.5"><Phone className="w-3 h-3" />{profile.contact_phone}</span>}
                    </div>
                </div>
                <span className={clsx("text-[10px] font-bold px-3 py-1 rounded-lg border uppercase",
                    profile.client_status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-500 border-stone-200"
                )}>{profile.client_status}</span>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-5 gap-3">
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black">{warmMatches}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Warm+ Matches</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black">{pursuits.length}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Pipeline</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black">{pendingTasks}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Open Tasks</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black">{docs.length}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Documents</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black">{competitors.length}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Competitors</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-stone-200">
                {TABS.map(tab => (
                    <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as typeof activeTab)}
                        className={clsx("flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors",
                            activeTab === tab.key ? "border-black text-black" : "border-transparent text-stone-400 hover:text-stone-600"
                        )}>
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {"count" in tab && tab.count > 0 && (
                            <span className="text-[9px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Edit Form */}
                    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
                        <h3 className="font-bold text-sm">Client Information</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ["company_name", "Company Name"],
                                ["contact_name", "Contact Name"],
                                ["email", "Email"],
                                ["contact_phone", "Phone"],
                                ["website", "Website"],
                                ["uei", "UEI"],
                                ["cage_code", "CAGE Code"],
                                ["state", "State"],
                                ["city", "City"],
                                ["address_line_1", "Address"],
                                ["zip_code", "ZIP"],
                                ["employee_count", "Employees"],
                                ["revenue", "Revenue"],
                            ].map(([key, label]) => (
                                <div key={key}>
                                    <label className="text-[9px] font-typewriter text-stone-400 uppercase">{label}</label>
                                    <input title={label} value={form[key] || ""} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                        className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs mt-0.5" />
                                </div>
                            ))}
                        </div>
                        <div>
                            <label className="text-[9px] font-typewriter text-stone-400 uppercase">Internal Notes</label>
                            <textarea title="Internal Notes" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs mt-0.5 h-20 resize-none" />
                        </div>
                        <button type="button" onClick={handleSave} disabled={saving}
                            className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                        </button>
                    </div>

                    {/* Top Matches */}
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                        <h3 className="font-bold text-sm mb-3">Top Matches ({matches.length})</h3>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {matches.slice(0, 10).map((m, i) => {
                                const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Record<string, unknown>;
                                return (
                                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-stone-50">
                                        <span className={clsx("font-black w-8 text-center",
                                            Number(m.score) >= 0.7 ? "text-emerald-600" : Number(m.score) >= 0.5 ? "text-amber-600" : "text-blue-600"
                                        )}>{Math.round(Number(m.score) * 100)}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{String(opp?.title || "")}</p>
                                            <p className="text-[10px] text-stone-400 truncate">{String(opp?.agency || "")}</p>
                                        </div>
                                        {String(opp?.notice_id || "") !== "" && (
                                            <a href={`https://sam.gov/opp/${String(opp?.notice_id)}/view`} target="_blank" rel="noopener noreferrer" title="SAM.gov" className="text-blue-600">
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "pipeline" && (
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <h3 className="font-bold text-sm mb-3">Pipeline ({pursuits.length} deals)</h3>
                    {pursuits.length === 0 ? (
                        <p className="text-xs text-stone-400">No deals in pipeline. Add matches from the client&apos;s portal.</p>
                    ) : (
                        <div className="space-y-2">
                            {pursuits.map((p, i) => {
                                const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Record<string, unknown>;
                                return (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-stone-100 hover:bg-stone-50">
                                        <span className="text-[9px] font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded uppercase">{String(p.stage)}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{String(opp?.title || "")}</p>
                                            <p className="text-[10px] text-stone-400">{String(opp?.agency || "")}</p>
                                        </div>
                                        {String(p.notes || "") !== "" && <p className="text-[10px] text-stone-500 italic max-w-xs truncate">{String(p.notes)}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "tasks" && (
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm">Tasks ({tasks.length})</h3>
                        <button type="button" onClick={() => setShowTaskForm(!showTaskForm)}
                            className="text-xs font-bold text-blue-600 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Assign Task</button>
                    </div>
                    {showTaskForm && (
                        <div className="border border-stone-200 rounded-lg p-3 mb-3 space-y-2 bg-stone-50">
                            <input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" className="w-full border rounded-lg px-2.5 py-1.5 text-xs" />
                            <textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Description..." className="w-full border rounded-lg px-2.5 py-1.5 text-xs h-16 resize-none" />
                            <div className="flex gap-2">
                                <select title="Priority" value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))} className="border rounded-lg px-2 py-1 text-xs">
                                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                                </select>
                                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={taskForm.notify} onChange={e => setTaskForm(f => ({ ...f, notify: e.target.checked }))} /> Email notify</label>
                                <button type="button" onClick={handleCreateTask} disabled={!taskForm.title} className="text-xs bg-black text-white px-3 py-1 rounded-lg font-bold disabled:opacity-50"><Send className="w-3 h-3 inline mr-1" />Assign</button>
                            </div>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        {tasks.map((t, i) => (
                            <div key={i} className={clsx("flex items-center gap-2 p-2.5 rounded-lg text-xs",
                                t.status === "completed" ? "bg-emerald-50" : t.status === "waiting_client" ? "bg-amber-50" : "bg-white border border-stone-100"
                            )}>
                                {t.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                                 t.status === "waiting_client" ? <AlertCircle className="w-4 h-4 text-amber-500" /> :
                                 <Clock className="w-4 h-4 text-stone-400" />}
                                <div className="flex-1 min-w-0">
                                    <p className={clsx("font-medium", t.status === "completed" && "line-through text-stone-400")}>{String(t.title)}</p>
                                    {String(t.description || "") !== "" && <p className="text-[10px] text-stone-400 truncate">{String(t.description)}</p>}
                                </div>
                                <span className="text-[9px] font-bold text-stone-400 uppercase">{String(t.priority)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === "docs" && (
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <h3 className="font-bold text-sm mb-3">Documents ({docs.length})</h3>
                    {docs.length === 0 ? (
                        <p className="text-xs text-stone-400">No documents uploaded yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {docs.map((d, i) => (
                                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-stone-100">
                                    <FileText className="w-5 h-5 text-stone-400" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{String(d.filename)}</p>
                                        <p className="text-[10px] text-stone-400">{String(d.category)} · {new Date(String(d.created_at)).toLocaleDateString()}</p>
                                    </div>
                                    <a href={String(d.file_url)} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600">Download</a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "competitors" && (
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <h3 className="font-bold text-sm mb-3">Competitors ({competitors.length})</h3>
                    <div className="space-y-2">
                        {competitors.map((c, i) => (
                            <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-stone-100">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold">{String(c.competitor_name)}</p>
                                    <p className="text-[10px] text-stone-400">{String(c.website || "")}</p>
                                </div>
                                <span className="text-xs font-bold">{String(c.overlap_score || 0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === "activity" && (
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <h3 className="font-bold text-sm mb-3">Activity Log</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {activity.map((a, i) => (
                            <div key={i} className="flex items-start gap-2 py-2 border-b border-stone-50 last:border-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-stone-700">{String(a.description)}</p>
                                    <p className="text-[10px] text-stone-400">{new Date(String(a.created_at)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
