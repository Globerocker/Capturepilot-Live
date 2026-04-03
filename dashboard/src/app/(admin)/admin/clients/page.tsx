"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Plus, Users, Mail, Phone, Globe, Hash, ChevronDown, Search,
    ListTodo, FileText, Loader2, Building2, Send,
} from "lucide-react";
import clsx from "clsx";

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
    client_status: string;
    client_since: string | null;
    total_tasks: number;
    pending_tasks: number;
    document_count: number;
    notes: string | null;
}

export default function AdminClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [bulkSending, setBulkSending] = useState(false);

    // Create form
    const [form, setForm] = useState({
        email: "", company_name: "", contact_name: "", contact_phone: "",
        website: "", uei: "", naics_codes: "", state: "", notes: "",
    });

    // Task form
    const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", category: "general", due_date: "", notify: true });
    const [showTaskForm, setShowTaskForm] = useState<string | null>(null);

    const loadClients = async () => {
        const res = await fetch("/api/admin/clients");
        const data = await res.json();
        setClients(data.clients || []);
        setLoading(false);
    };

    useEffect(() => { loadClients(); }, []);

    const handleCreate = async () => {
        setCreating(true);
        setCreateResult("");
        const payload = {
            ...form,
            naics_codes: form.naics_codes.split(",").map(s => s.trim()).filter(Boolean),
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
            setForm({ email: "", company_name: "", contact_name: "", contact_phone: "", website: "", uei: "", naics_codes: "", state: "", notes: "" });
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

    return (
        <div className="min-h-screen bg-stone-50 p-6 sm:p-8">
            <div className="w-full space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                            <Users className="w-6 h-6" /> Consulting Clients
                        </h1>
                        <p className="text-sm text-stone-500 mt-1">{clients.length} active clients</p>
                    </div>
                    <div className="flex gap-2">
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
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-blue-700 disabled:opacity-50">
                            <Mail className="w-4 h-4" /> {bulkSending ? "Sending..." : "Bulk Email"}
                        </button>
                        <button type="button" onClick={() => setShowCreate(!showCreate)}
                            className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-800 transition-colors">
                            <Plus className="w-4 h-4" /> New Client
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by company name, email, or NAICS..."
                        className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-black bg-white" />
                </div>

                {createResult && (
                    <div className={clsx("p-4 rounded-xl text-sm font-medium", createResult.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200")}>
                        {createResult}
                    </div>
                )}

                {/* Create Client Form */}
                {showCreate && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
                        <h2 className="font-bold text-sm">Create Consulting Client</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email *" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company Name *" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact Name" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Phone" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="Website" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.uei} onChange={e => setForm(f => ({ ...f, uei: e.target.value }))} placeholder="UEI" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.naics_codes} onChange={e => setForm(f => ({ ...f, naics_codes: e.target.value }))} placeholder="NAICS codes (comma separated)" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                            <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20" />
                        <button type="button" onClick={handleCreate} disabled={creating || !form.email || !form.company_name}
                            className="bg-black text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                            {creating ? "Creating..." : "Create Client & Send Welcome Email"}
                        </button>
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
                                    <div className="flex items-center gap-2">
                                        <Link href={`/admin/clients/${client.id}`} className="font-bold text-sm text-black hover:underline">{client.company_name}</Link>
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
                                    <span className="inline-flex items-center gap-1"><ListTodo className="w-3.5 h-3.5" /> {client.pending_tasks} tasks</span>
                                    <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {client.document_count} docs</span>
                                </div>
                                <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform cursor-pointer", expandedId === client.id && "rotate-180")} onClick={() => setExpandedId(expandedId === client.id ? null : client.id)} />
                            </div>

                            {expandedId === client.id && (
                                <div className="border-t border-stone-100 p-5 space-y-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        {client.website && <div><p className="text-stone-400 uppercase font-typewriter">Website</p><a href={client.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1"><Globe className="w-3 h-3" />{client.website.replace(/^https?:\/\//, "")}</a></div>}
                                        {client.uei && <div><p className="text-stone-400 uppercase font-typewriter">UEI</p><p className="font-bold inline-flex items-center gap-1"><Hash className="w-3 h-3" />{client.uei}</p></div>}
                                        {client.contact_phone && <div><p className="text-stone-400 uppercase font-typewriter">Phone</p><p className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{client.contact_phone}</p></div>}
                                        {client.state && <div><p className="text-stone-400 uppercase font-typewriter">State</p><p className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{client.state}</p></div>}
                                    </div>
                                    {client.naics_codes.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase font-typewriter mb-1">NAICS Codes</p>
                                            <div className="flex flex-wrap gap-1">{client.naics_codes.map((c, i) => <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">{c}</span>)}</div>
                                        </div>
                                    )}
                                    {client.notes && <div><p className="text-[10px] text-stone-400 uppercase font-typewriter mb-1">Notes</p><p className="text-xs text-stone-600">{client.notes}</p></div>}

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
                        <p className="text-stone-500 text-sm">No consulting clients yet. Click &quot;New Client&quot; to create the first one.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
