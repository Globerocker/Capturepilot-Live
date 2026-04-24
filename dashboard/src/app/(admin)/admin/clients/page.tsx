"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Plus, Users, Mail, Phone, Globe, Hash, ChevronDown, Search,
    ListTodo, FileText, Loader2, Building2, Send, Sparkles, CheckCircle2, AlertTriangle,
    UserCog, Shield,
} from "lucide-react";
import clsx from "clsx";
import KeywordPicker from "@/components/KeywordPicker";

type AccountType = "consulting" | "self_service" | "admin";

function formatTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 3600_000) return `${Math.max(0, Math.floor(diff / 60_000))}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString();
}

interface Client {
    id: string;
    company_name: string;
    email: string;
    contact_name: string | null;
    contact_phone: string | null;
    website: string | null;
    uei: string | null;
    cage_code: string | null;
    naics_codes: string[];
    state: string | null;
    account_type: AccountType;
    client_status: string;
    client_since: string | null;
    total_tasks: number;
    pending_tasks: number;
    document_count: number;
    notes: string | null;
    last_login: string | null;
}

export default function AdminClientsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-stone-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>}>
            <AdminClientsPageInner />
        </Suspense>
    );
}

function AdminClientsPageInner() {
    const searchParams = useSearchParams();
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [bulkSending, setBulkSending] = useState(false);
    const [accountTab, setAccountTab] = useState<"all" | AccountType>(
        (searchParams.get("tab") as "all" | AccountType) || "consulting"
    );

    // Create form — extended on Apr 20 to carry capability keywords +
    // company_description so the admin can ship a fully-primed profile
    // rather than letting the consulting client stare at a cold dashboard.
    const [form, setForm] = useState({
        email: "", company_name: "", contact_name: "", contact_phone: "",
        website: "", uei: "", naics_codes: "", state: "", notes: "",
        company_description: "",
    });
    const [primaryKeywords, setPrimaryKeywords] = useState<string[]>([]);
    const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
    const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);

    // "Analyze website" pre-invite Quick Checker — pulls description, NAICS,
    // contacts, certs, and keyword suggestions from the website before the
    // admin commits to creating the account. No auth user is touched yet.
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState("");
    const [analysisPreview, setAnalysisPreview] = useState<null | {
        description: string;
        services: string[];
        certifications: string[];
        contacts: { name?: string; email?: string; phone?: string }[];
        pages_crawled: number;
        naics_suggested: string[];
    }>(null);

    // Task form
    const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", category: "general", due_date: "", notify: true });
    const [showTaskForm, setShowTaskForm] = useState<string | null>(null);

    const loadClients = async (tab: "all" | AccountType = accountTab) => {
        setLoading(true);
        const res = await fetch(`/api/admin/clients?account_type=${tab}`);
        const data = await res.json();
        setClients(data.clients || []);
        setLoading(false);
    };

    useEffect(() => { loadClients(accountTab); }, [accountTab]);

    // Hydrate the create form from ?prefill=1&email=…&company_name=… when a
    // lead-check result deep-links here. Opens the form automatically so the
    // admin lands right where they left off.
    useEffect(() => {
        if (searchParams.get("prefill") !== "1") return;
        setForm(prev => ({
            ...prev,
            email: searchParams.get("email") || prev.email,
            company_name: searchParams.get("company_name") || prev.company_name,
            contact_name: searchParams.get("contact_name") || prev.contact_name,
            contact_phone: searchParams.get("contact_phone") || prev.contact_phone,
            website: searchParams.get("website") || prev.website,
            uei: searchParams.get("uei") || prev.uei,
            state: searchParams.get("state") || prev.state,
            naics_codes: searchParams.get("naics_codes") || prev.naics_codes,
            company_description: searchParams.get("description") || prev.company_description,
        }));
        setShowCreate(true);
    }, [searchParams]);

    const handleAnalyzeWebsite = async () => {
        const site = form.website.trim();
        if (!site) {
            setAnalyzeError("Enter a website first.");
            return;
        }
        setAnalyzing(true);
        setAnalyzeError("");
        setAnalysisPreview(null);
        try {
            const brandRes = await fetch("/api/brand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ website: site }),
            });
            const brand = await brandRes.json();
            if (!brandRes.ok) {
                setAnalyzeError(brand.error || `Brand crawl failed (${brandRes.status})`);
                setAnalyzing(false);
                return;
            }

            const primaryContact = Array.isArray(brand.contacts) ? brand.contacts[0] : null;
            const firstLocationState = Array.isArray(brand.locations)
                ? (brand.locations.find((l: { state?: string }) => l.state)?.state || "")
                : "";
            const inferredNaics: string[] = Array.isArray(brand.inferred_naics)
                ? brand.inferred_naics
                      .map((n: unknown) => typeof n === "string" ? n : (n as { code?: string })?.code)
                      .filter((c: unknown): c is string => typeof c === "string" && /^\d{4,6}$/.test(c))
                : [];

            // Prefill form only where empty — don't overwrite admin's manual edits.
            setForm(prev => ({
                ...prev,
                company_name: prev.company_name || brand.company_name || "",
                contact_name: prev.contact_name || (primaryContact?.name ?? ""),
                contact_phone: prev.contact_phone || (primaryContact?.phone ?? ""),
                email: prev.email || (primaryContact?.email ?? ""),
                uei: prev.uei || brand.detected_uei || "",
                state: prev.state || firstLocationState || "",
                company_description: prev.company_description || brand.description || "",
                naics_codes: prev.naics_codes || inferredNaics.join(", "),
            }));

            // Ask the library for keyword suggestions based on the crawl so the
            // admin can one-click-accept them into the picker below.
            try {
                const kwRes = await fetch("/api/keywords/suggest", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        company_name: brand.company_name,
                        company_description: brand.description,
                        services: brand.services || [],
                        differentiators: brand.differentiators || [],
                    }),
                });
                if (kwRes.ok) {
                    const kw = await kwRes.json() as { primary?: string[]; secondary?: string[] };
                    setSuggestedKeywords([...(kw.primary || []), ...(kw.secondary || [])]);
                    if (primaryKeywords.length === 0 && (kw.primary?.length || 0) > 0) {
                        setPrimaryKeywords((kw.primary || []).slice(0, 3));
                    }
                    if (secondaryKeywords.length === 0 && (kw.secondary?.length || 0) > 0) {
                        setSecondaryKeywords((kw.secondary || []).slice(0, 5));
                    }
                }
            } catch { /* keyword suggest is best-effort */ }

            setAnalysisPreview({
                description: brand.description || "",
                services: brand.services || [],
                certifications: (brand.certifications || []).map((c: { type?: string }) => c.type || "").filter(Boolean),
                contacts: brand.contacts || [],
                pages_crawled: (brand.pages_crawled || []).length,
                naics_suggested: inferredNaics,
            });
        } catch (e) {
            setAnalyzeError((e as Error).message || "Analyze failed");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        setCreateResult("");
        const payload = {
            ...form,
            naics_codes: form.naics_codes.split(",").map(s => s.trim()).filter(Boolean),
            primary_keywords: primaryKeywords,
            secondary_keywords: secondaryKeywords,
        };
        const res = await fetch("/api/admin/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
            setCreateResult(`Client created! Temp password: ${data.temp_password}`);
            setShowCreate(false);
            setForm({ email: "", company_name: "", contact_name: "", contact_phone: "", website: "", uei: "", naics_codes: "", state: "", notes: "", company_description: "" });
            setPrimaryKeywords([]);
            setSecondaryKeywords([]);
            setSuggestedKeywords([]);
            setAnalysisPreview(null);
            loadClients();
        } else {
            setCreateResult(`Error: ${data.error}`);
        }
        setCreating(false);
    };

    const handleCreateTask = async (profileId: string) => {
        const res = await fetch("/api/admin/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_profile_id: profileId, ...taskForm }),
        });
        if ((await res.json()).success) {
            setShowTaskForm(null);
            setTaskForm({ title: "", description: "", priority: "medium", category: "general", due_date: "", notify: true });
            loadClients();
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    }

    const tabMeta: Record<"all" | AccountType, { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = {
        all:          { label: "All accounts",  icon: Users,   hint: "Consulting clients + self-service users + admins" },
        consulting:   { label: "Clients",       icon: Users,   hint: "Managed consulting clients (portal + tasks + docs)" },
        self_service: { label: "Self-service",  icon: UserCog, hint: "SaaS users who onboarded themselves" },
        admin:        { label: "Admins",        icon: Shield,  hint: "Internal team accounts" },
    };

    const currentMeta = tabMeta[accountTab];

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Customers</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Users className="w-6 h-6" /> People
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">{currentMeta.hint} · {clients.length} {clients.length === 1 ? "person" : "people"}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {accountTab === "consulting" && (
                        <button type="button" onClick={async () => {
                            if (!confirm(`Send opportunity update email to all ${clients.length} active clients?`)) return;
                            setBulkSending(true);
                            for (const c of clients.filter(cl => cl.client_status === "active")) {
                                await fetch("/api/admin/send-update", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ user_profile_id: c.id, type: "opportunities" }),
                                }).catch(() => {});
                            }
                            setBulkSending(false);
                            setCreateResult(`Sent opportunity updates to ${clients.filter(c => c.client_status === "active").length} clients`);
                        }}
                        disabled={bulkSending}
                        className="bg-white border border-stone-200 hover:border-stone-300 text-stone-700 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            <Mail className="w-4 h-4" /> {bulkSending ? "Sending..." : "Bulk Email"}
                        </button>
                    )}
                    {accountTab === "consulting" && (
                        <button type="button" onClick={() => setShowCreate(!showCreate)}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm">
                            <Plus className="w-4 h-4" /> New Client
                        </button>
                    )}
                </div>
            </div>

            {/* Account-type tabs */}
            <div className="bg-white border border-stone-200 rounded-2xl p-1 inline-flex flex-wrap gap-0.5">
                {(["all", "consulting", "self_service", "admin"] as const).map(key => {
                    const meta = tabMeta[key];
                    const Icon = meta.icon;
                    const active = accountTab === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setAccountTab(key)}
                            className={clsx(
                                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all",
                                active
                                    ? "bg-stone-900 text-white shadow-sm"
                                    : "text-stone-500 hover:text-stone-800 hover:bg-stone-50"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" /> {meta.label}
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by company name, email, or NAICS…"
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white" />
            </div>

                {createResult && (
                    <div className={clsx("p-4 rounded-xl text-sm font-medium", createResult.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200")}>
                        {createResult}
                    </div>
                )}

                {/* Create Client Form */}
                {showCreate && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="font-bold text-sm">Create Consulting Client</h2>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    Paste the website first — the Analyze button pre-fills company, NAICS, contacts, and keywords so the client signs in to a warm profile.
                                </p>
                            </div>
                        </div>

                        {/* Step 1 — Website + Quick Checker */}
                        <div className="rounded-xl border border-stone-200 p-4 bg-stone-50 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">Step 1</span>
                                <h3 className="text-xs font-bold text-stone-700">Analyze website (pre-invite Quick Checker)</h3>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    value={form.website}
                                    onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                                    placeholder="https://acmelogistics.com"
                                    className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm bg-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleAnalyzeWebsite}
                                    disabled={analyzing || !form.website.trim()}
                                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2 rounded-xl disabled:opacity-50"
                                >
                                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {analyzing ? "Analyzing…" : "Analyze Website"}
                                </button>
                            </div>
                            {analyzeError && (
                                <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {analyzeError}
                                </div>
                            )}
                            {analysisPreview && (
                                <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-3 py-2 space-y-1.5">
                                    <div className="inline-flex items-center gap-1.5 font-bold">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        Crawled {analysisPreview.pages_crawled} page{analysisPreview.pages_crawled === 1 ? "" : "s"} — fields below auto-filled.
                                    </div>
                                    {analysisPreview.naics_suggested.length > 0 && (
                                        <p><strong>Suggested NAICS:</strong> {analysisPreview.naics_suggested.join(", ")}</p>
                                    )}
                                    {analysisPreview.contacts.length > 0 && (
                                        <p>
                                            <strong>Decision maker:</strong>{" "}
                                            {analysisPreview.contacts[0].name || "—"}
                                            {analysisPreview.contacts[0].email && ` · ${analysisPreview.contacts[0].email}`}
                                            {analysisPreview.contacts[0].phone && ` · ${analysisPreview.contacts[0].phone}`}
                                        </p>
                                    )}
                                    {analysisPreview.certifications.length > 0 && (
                                        <p><strong>Certifications detected:</strong> {analysisPreview.certifications.join(", ")}</p>
                                    )}
                                    {analysisPreview.services.length > 0 && (
                                        <p className="line-clamp-2"><strong>Services:</strong> {analysisPreview.services.slice(0, 6).join(" · ")}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Step 2 — Client profile fields */}
                        <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">Step 2</span>
                                <h3 className="text-xs font-bold text-stone-700">Confirm client profile</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email *" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company Name *" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact Name" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Phone" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                <input value={form.uei} onChange={e => setForm(f => ({ ...f, uei: e.target.value }))} placeholder="UEI" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                <input value={form.naics_codes} onChange={e => setForm(f => ({ ...f, naics_codes: e.target.value }))} placeholder="NAICS codes (comma separated)" className="border border-stone-300 rounded-xl px-3 py-2 text-sm sm:col-span-2" />
                            </div>
                            <textarea
                                value={form.company_description}
                                onChange={e => setForm(f => ({ ...f, company_description: e.target.value }))}
                                placeholder="Company description (fills from website if you analyzed above)…"
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20"
                            />
                        </div>

                        {/* Step 3 — Capability keywords (drives matching) */}
                        <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">Step 3</span>
                                <h3 className="text-xs font-bold text-stone-700">Capability keywords</h3>
                                <span className="text-[10px] text-stone-400">drives title/description matching beyond NAICS</span>
                            </div>
                            <KeywordPicker
                                primary={primaryKeywords}
                                secondary={secondaryKeywords}
                                suggestions={suggestedKeywords}
                                onChange={(p, s) => { setPrimaryKeywords(p); setSecondaryKeywords(s); }}
                            />
                        </div>

                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20" />
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={handleCreate} disabled={creating || !form.email || !form.company_name}
                                className="bg-black text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {creating ? "Creating…" : "Create Client & Send Welcome Email"}
                            </button>
                            <span className="text-[11px] text-stone-500">Fires website crawl + opportunity match on save.</span>
                        </div>
                    </div>
                )}

                {/* Client List */}
                <div className="space-y-3">
                    {clients.filter(c => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        return c.company_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.contact_name || "").toLowerCase().includes(q) || c.naics_codes.some(n => n.includes(q));
                    }).map(client => (
                        <div key={client.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                            <div className="w-full text-left p-5 flex items-center gap-4 hover:bg-stone-50/50 transition-colors">
                                <Link href={`/admin/clients/${client.id}`} className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm flex-shrink-0 hover:bg-stone-800 transition-colors">
                                    {client.company_name.charAt(0).toUpperCase()}
                                </Link>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link href={`/admin/clients/${client.id}`} className="font-bold text-sm text-black hover:underline">{client.company_name || client.email}</Link>
                                        <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded uppercase",
                                            client.account_type === "admin" ? "bg-red-50 text-red-700 border border-red-100" :
                                            client.account_type === "consulting" ? "bg-violet-50 text-violet-700 border border-violet-100" :
                                            "bg-stone-100 text-stone-600 border border-stone-200"
                                        )}>{client.account_type === "self_service" ? "SaaS" : client.account_type}</span>
                                        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                                            client.client_status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            "bg-stone-100 text-stone-500 border-stone-200"
                                        )}>{client.client_status}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-stone-500">
                                        {client.contact_name && <span>{client.contact_name}</span>}
                                        <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {client.email}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-stone-500">
                                    {client.account_type === "consulting" && (
                                        <>
                                            <span className="inline-flex items-center gap-1"><ListTodo className="w-3.5 h-3.5" /> {client.pending_tasks} tasks</span>
                                            <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {client.document_count} docs</span>
                                        </>
                                    )}
                                    {client.last_login && (
                                        <span className="hidden sm:inline text-[10px] text-stone-400">
                                            Last login {formatTimeAgo(client.last_login)}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        title="View portal as this client (30-min impersonation)"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const res = await fetch("/api/admin/impersonate", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ user_profile_id: client.id }),
                                            });
                                            if (res.ok) window.location.href = "/portal";
                                            else alert("Impersonation failed");
                                        }}
                                        className="inline-flex items-center gap-1 bg-stone-900 text-white text-[10px] font-bold px-2 py-1 rounded-full hover:bg-stone-700"
                                    >
                                        View as →
                                    </button>
                                </div>
                                <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform cursor-pointer", expandedId === client.id && "rotate-180")} onClick={() => setExpandedId(expandedId === client.id ? null : client.id)} />
                            </div>

                            {expandedId === client.id && (
                                <div className="border-t border-stone-100 p-5 space-y-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        {client.website && <div><p className="text-stone-400 uppercase">Website</p><a href={client.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1"><Globe className="w-3 h-3" />{client.website.replace(/^https?:\/\//, "")}</a></div>}
                                        {client.uei && <div><p className="text-stone-400 uppercase">UEI</p><p className="font-bold inline-flex items-center gap-1"><Hash className="w-3 h-3" />{client.uei}</p></div>}
                                        {client.contact_phone && <div><p className="text-stone-400 uppercase">Phone</p><p className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{client.contact_phone}</p></div>}
                                        {client.state && <div><p className="text-stone-400 uppercase">State</p><p className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{client.state}</p></div>}
                                    </div>
                                    {client.naics_codes.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase mb-1">NAICS Codes</p>
                                            <div className="flex flex-wrap gap-1">{client.naics_codes.map((c, i) => <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">{c}</span>)}</div>
                                        </div>
                                    )}
                                    {client.notes && <div><p className="text-[10px] text-stone-400 uppercase mb-1">Notes</p><p className="text-xs text-stone-600">{client.notes}</p></div>}

                                    {/* Add Task */}
                                    <div className="border-t border-stone-100 pt-4">
                                        {showTaskForm === client.id ? (
                                            <div className="space-y-3">
                                                <input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title *" className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                                <textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (make it crystal clear)..." className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20" />
                                                <div className="flex gap-2">
                                                    <select title="Priority" value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))} className="border border-stone-300 rounded-xl px-3 py-2 text-sm">
                                                        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                                                    </select>
                                                    <select title="Category" value={taskForm.category} onChange={e => setTaskForm(f => ({ ...f, category: e.target.value }))} className="border border-stone-300 rounded-xl px-3 py-2 text-sm">
                                                        <option value="general">General</option><option value="document">Document</option><option value="email_setup">Email Setup</option><option value="website">Website</option><option value="sam_registration">SAM.gov</option><option value="proposal">Proposal</option><option value="opportunity">Opportunity</option><option value="compliance">Compliance</option><option value="onboarding">Onboarding</option><option value="registration">Registration</option>
                                                    </select>
                                                    <input title="Due date" type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={taskForm.notify} onChange={e => setTaskForm(f => ({ ...f, notify: e.target.checked }))} /> Send email notification</label>
                                                    <button type="button" onClick={() => handleCreateTask(client.id)} disabled={!taskForm.title} className="bg-black text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1"><Send className="w-3 h-3" /> Assign Task</button>
                                                    <button type="button" onClick={() => setShowTaskForm(null)} className="text-xs text-stone-500">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => setShowTaskForm(client.id)} className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                                <Plus className="w-3.5 h-3.5" /> Assign Task
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

            {clients.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                    <Users className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm">
                        {accountTab === "consulting"
                            ? "No consulting clients yet. Click “New Client” to create the first one."
                            : accountTab === "self_service"
                                ? "No self-service users yet. They sign up via the public /signup page."
                                : accountTab === "admin"
                                    ? "No admin accounts yet. Change a user’s account type from their detail page."
                                    : "No accounts match this filter."}
                    </p>
                </div>
            )}
        </div>
    );
}
