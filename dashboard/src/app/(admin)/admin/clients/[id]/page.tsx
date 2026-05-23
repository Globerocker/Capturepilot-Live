"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ArrowLeft, Building2, Mail, Phone, Globe, Hash, Save, Loader2,
    ListTodo, FileText, Users, Target, Briefcase, Clock, CheckCircle2,
    AlertCircle, Plus, Send, ExternalLink, Layers, Sparkles,
    Key, Shield, LogOut as LogOutIcon, Trash2, UserCog,
} from "lucide-react";
import clsx from "clsx";
import { MarketIntelligence } from "@/components/MarketIntelligence";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Color palette for activity-log entries. Keep in sync with the same map on
// /admin/overview so chips look identical in both places.
const ACTION_TONE_DETAIL: Record<string, string> = {
    client_created: "bg-emerald-50 text-emerald-700 border-emerald-200",
    client_updated: "bg-blue-50 text-blue-700 border-blue-200",
    account_type_changed: "bg-violet-50 text-violet-700 border-violet-200",
    password_reset: "bg-amber-50 text-amber-700 border-amber-200",
    status_changed: "bg-amber-50 text-amber-700 border-amber-200",
    impersonation: "bg-rose-50 text-rose-700 border-rose-200",
    deletion: "bg-rose-50 text-rose-700 border-rose-200",
    task_created: "bg-blue-50 text-blue-700 border-blue-200",
    task_completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    document_uploaded: "bg-cyan-50 text-cyan-700 border-cyan-200",
    admin_user_update: "bg-violet-50 text-violet-700 border-violet-200",
};

interface ClientProfile {
    id: string;
    auth_user_id: string | null;
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
    account_type: "consulting" | "self_service" | "admin";
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
        // Switched from direct supabase browser-client calls to the new
        // /api/admin/clients/[id] endpoint. The browser uses the anon key
        // + RLS, which only exposes a user's OWN row — admins viewing OTHER
        // clients got "Client not found" because the target row was
        // invisible to them. The server endpoint runs behind assertAdmin()
        // with the service key, so it can see everything.
        (async () => {
            try {
                const res = await fetch(`/api/admin/clients/${clientId}`, { cache: "no-store" });
                if (!res.ok) {
                    setLoading(false);
                    return;
                }
                const body = await res.json() as {
                    profile: ClientProfile;
                    tasks: Array<Record<string, unknown>>;
                    documents: Array<Record<string, unknown>>;
                    matches: Array<Record<string, unknown>>;
                    pursuits: Array<Record<string, unknown>>;
                    activity: Array<Record<string, unknown>>;
                    competitors: Array<Record<string, unknown>>;
                };
                if (body.profile) {
                    setProfile(body.profile);
                    setForm({
                        company_name: body.profile.company_name || "",
                        contact_name: body.profile.contact_name || "",
                        contact_phone: body.profile.contact_phone || "",
                        email: body.profile.email || "",
                        website: body.profile.website || "",
                        uei: body.profile.uei || "",
                        cage_code: body.profile.cage_code || "",
                        state: body.profile.state || "",
                        city: body.profile.city || "",
                        address_line_1: body.profile.address_line_1 || "",
                        zip_code: body.profile.zip_code || "",
                        notes: body.profile.notes || "",
                        employee_count: String(body.profile.employee_count || ""),
                        revenue: String(body.profile.revenue || ""),
                    });
                }
                setTasks(body.tasks || []);
                setDocs(body.documents || []);
                setMatches(body.matches || []);
                setPursuits(body.pursuits || []);
                setActivity(body.activity || []);
                setCompetitors(body.competitors || []);
            } finally {
                setLoading(false);
            }
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
        // Reload the entire bundle from the admin endpoint (same reason as
        // the initial fetch — browser client can't see other profiles' tasks
        // through RLS).
        const reload = await fetch(`/api/admin/clients/${clientId}`, { cache: "no-store" });
        if (reload.ok) {
            const body = await reload.json() as { tasks?: Array<Record<string, unknown>> };
            setTasks(body.tasks || []);
        }
    };

    // ─── User-account actions ──────────────────────────────────────────────
    // These used to live on the separate /admin/users page. Folded here so the
    // admin doesn't have to bounce between two tabs to manage the same person.
    const [accountBusy, setAccountBusy] = useState<null | "password" | "account_type" | "status" | "delete" | "impersonate">(null);
    const [accountMessage, setAccountMessage] = useState<null | { kind: "ok" | "err"; text: string }>(null);

    const handleResetPassword = async () => {
        if (!profile?.auth_user_id) { setAccountMessage({ kind: "err", text: "No auth user on this profile." }); return; }
        const next = prompt("Set a new password for this user (min 10 chars)");
        if (!next || next.length < 10) return;
        setAccountBusy("password");
        try {
            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auth_id: profile.auth_user_id, password: next }),
            });
            const data = await res.json();
            setAccountMessage(res.ok
                ? { kind: "ok", text: "Password reset — the user should be notified out-of-band." }
                : { kind: "err", text: data.error || "Password reset failed" });
        } finally {
            setAccountBusy(null);
        }
    };

    const handleChangeAccountType = async (next: "consulting" | "self_service" | "admin") => {
        if (!profile || profile.account_type === next) return;
        setAccountBusy("account_type");
        try {
            const res = await fetch("/api/admin/clients", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: clientId, account_type: next }),
            });
            const data = await res.json();
            if (res.ok) {
                setProfile(p => (p ? { ...p, account_type: next } : p));
                setAccountMessage({ kind: "ok", text: `Account type changed to ${next}.` });
            } else {
                setAccountMessage({ kind: "err", text: data.error || "Update failed" });
            }
        } finally {
            setAccountBusy(null);
        }
    };

    const handleToggleStatus = async () => {
        if (!profile) return;
        const next = profile.client_status === "active" ? "churned" : "active";
        setAccountBusy("status");
        try {
            const res = await fetch("/api/admin/clients", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: clientId, client_status: next }),
            });
            const data = await res.json();
            if (res.ok) {
                setProfile(p => (p ? { ...p, client_status: next } : p));
                setAccountMessage({ kind: "ok", text: next === "active" ? "Account re-activated." : "Account deactivated." });
            } else {
                setAccountMessage({ kind: "err", text: data.error || "Update failed" });
            }
        } finally {
            setAccountBusy(null);
        }
    };

    const handleImpersonate = async () => {
        setAccountBusy("impersonate");
        try {
            const res = await fetch("/api/admin/impersonate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: clientId }),
            });
            if (res.ok) window.location.href = "/portal";
            else {
                const data = await res.json().catch(() => ({}));
                setAccountMessage({ kind: "err", text: data.error || "Impersonation failed" });
                setAccountBusy(null);
            }
        } catch (e) {
            setAccountMessage({ kind: "err", text: e instanceof Error ? e.message : "Impersonation failed" });
            setAccountBusy(null);
        }
    };

    const handleDeleteAccount = async () => {
        if (!profile?.auth_user_id) { setAccountMessage({ kind: "err", text: "No auth user on this profile." }); return; }
        const confirmed = prompt(`Type the email "${profile.email}" to permanently delete this account and all linked data.`);
        if (confirmed !== profile.email) return;
        setAccountBusy("delete");
        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ auth_id: profile.auth_user_id }),
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = "/admin/clients";
            } else {
                setAccountMessage({ kind: "err", text: data.error || "Delete failed" });
                setAccountBusy(null);
            }
        } catch (e) {
            setAccountMessage({ kind: "err", text: e instanceof Error ? e.message : "Delete failed" });
            setAccountBusy(null);
        }
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
                    <h1 className="text-xl font-bold">{profile.company_name}</h1>
                    <div className="flex items-center gap-3 text-xs text-stone-500 mt-0.5">
                        {profile.contact_name && <span>{profile.contact_name}</span>}
                        {profile.email && <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" />{profile.email}</span>}
                        {profile.contact_phone && <span className="inline-flex items-center gap-0.5"><Phone className="w-3 h-3" />{profile.contact_phone}</span>}
                    </div>
                </div>
                <Link
                    href={`/admin/clients/${clientId}/quick-checker`}
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 uppercase"
                >
                    <Sparkles className="w-3 h-3" /> Quick Checker
                </Link>
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
            {activeTab === "overview" && (<>
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
                                    <label className="text-[9px] text-stone-400 uppercase">{label}</label>
                                    <input title={label} value={form[key] || ""} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                        className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs mt-0.5" />
                                </div>
                            ))}
                        </div>
                        <div>
                            <label className="text-[9px] text-stone-400 uppercase">Internal Notes</label>
                            <textarea title="Internal Notes" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs mt-0.5 h-20 resize-none" />
                        </div>
                        <button type="button" onClick={handleSave} disabled={saving}
                            className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                        </button>
                    </div>

                    {/* Right column: Matches + User Account */}
                    <div className="space-y-4">
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

                        {/* User-account actions — password, impersonate, account type, deactivate, delete */}
                        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <UserCog className="w-4 h-4 text-stone-500" />
                                <h3 className="font-bold text-sm">User account</h3>
                                <span className={clsx("ml-auto text-[9px] font-bold px-2 py-0.5 rounded uppercase",
                                    profile.account_type === "admin" ? "bg-red-50 text-red-700 border border-red-100" :
                                    profile.account_type === "consulting" ? "bg-violet-50 text-violet-700 border border-violet-100" :
                                    "bg-stone-100 text-stone-600 border border-stone-200"
                                )}>{profile.account_type === "self_service" ? "SaaS" : profile.account_type}</span>
                            </div>

                            {accountMessage && (
                                <div className={clsx(
                                    "text-xs rounded-lg px-3 py-2 border",
                                    accountMessage.kind === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                                )}>
                                    {accountMessage.text}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={handleImpersonate}
                                    disabled={accountBusy !== null}
                                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                                >
                                    {accountBusy === "impersonate" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOutIcon className="w-3.5 h-3.5" />}
                                    View as user
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetPassword}
                                    disabled={accountBusy !== null || !profile.auth_user_id}
                                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-white border border-stone-200 hover:border-stone-300 text-stone-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                                >
                                    {accountBusy === "password" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                    Reset password
                                </button>
                            </div>

                            <div>
                                <label htmlFor="account-type-select" className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5 block">Account type</label>
                                <div className="inline-flex items-center bg-stone-100 rounded-lg p-1 gap-0.5 w-full">
                                    {(["self_service", "consulting", "admin"] as const).map(t => (
                                        <button
                                            key={t}
                                            id="account-type-select"
                                            type="button"
                                            onClick={() => handleChangeAccountType(t)}
                                            disabled={accountBusy !== null}
                                            className={clsx(
                                                "flex-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all disabled:opacity-50",
                                                profile.account_type === t
                                                    ? "bg-white text-stone-900 shadow-sm"
                                                    : "text-stone-500 hover:text-stone-800"
                                            )}
                                        >
                                            {t === "self_service" ? "SaaS" : t === "consulting" ? "Consulting" : "Admin"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                                <button
                                    type="button"
                                    onClick={handleToggleStatus}
                                    disabled={accountBusy !== null}
                                    className={clsx(
                                        "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50",
                                        profile.client_status === "active"
                                            ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100"
                                            : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100"
                                    )}
                                >
                                    {accountBusy === "status" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                                    {profile.client_status === "active" ? "Deactivate" : "Re-activate"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteAccount}
                                    disabled={accountBusy !== null || !profile.auth_user_id}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                    title="Permanently delete this auth user + profile (confirmation required)"
                                >
                                    {accountBusy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    Delete account
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Market Intelligence */}
                {profile?.naics_codes && profile.naics_codes.length > 0 && (
                    <MarketIntelligence naicsCodes={profile.naics_codes} companyName={profile.company_name} />
                )}
            </>)}

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
                    <div className="flex items-baseline justify-between mb-3">
                        <h3 className="font-bold text-sm">Activity Log</h3>
                        <p className="text-[10px] text-stone-400">{activity.length} entries · most recent first</p>
                    </div>
                    {activity.length === 0 && (
                        <p className="text-xs text-stone-400">No activity logged yet for this profile.</p>
                    )}
                    <div className="space-y-2.5 max-h-[600px] overflow-y-auto">
                        {activity.map((a, i) => {
                            const action = String(a.action || "unknown");
                            const description = String(a.description || "");
                            const meta = (a.metadata as Record<string, unknown> | null) || null;
                            const fields = meta && Array.isArray(meta.fields) ? (meta.fields as string[]) : null;
                            const created = String(a.created_at);
                            const tone = ACTION_TONE_DETAIL[action] || "bg-stone-100 text-stone-600 border-stone-200";
                            return (
                                <div key={i} className="flex items-start gap-3 py-2 border-b border-stone-50 last:border-0">
                                    <span className={clsx(
                                        "text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap mt-0.5",
                                        tone,
                                    )}>
                                        {action.replace(/_/g, " ")}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-stone-700">{description}</p>
                                        {/* Metadata fields — surfaces *which* columns changed on a client_updated, etc. */}
                                        {fields && fields.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {fields.map((f, idx) => (
                                                    <span key={idx} className="text-[9px] font-mono text-stone-500 bg-stone-50 border border-stone-200 px-1.5 py-0.5 rounded">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[10px] text-stone-400">
                                                {new Date(created).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                            </p>
                                            {a.actor_id ? (
                                                <p className="text-[10px] text-stone-400">
                                                    · actor <span className="font-mono">{String(a.actor_id).slice(0, 8)}</span>
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
