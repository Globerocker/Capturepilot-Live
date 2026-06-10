"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Search, Filter, Plus, Upload, Users, Mail, Phone, Tag, MapPin,
    Loader2, CheckSquare, Square, X, Trash2, Send, ChevronRight, Building2,
    Briefcase, Hash, Clock, AlertCircle, ChevronDown, RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import ImportContactsModal from "@/components/outreach/ImportContactsModal";
import ContactDrawer from "@/components/outreach/ContactDrawer";

interface Contact {
    id: string;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    title: string | null;
    naics_codes: string[];
    state: string | null;
    source: string | null;
    tags: string[];
    engagement_score: number;
    last_engagement_at: string | null;
    last_bounced_at: string | null;
    opted_out_at: string | null;
    created_at: string;
}

interface ListMeta {
    id: string;
    name: string;
    contact_count: number;
}

const SOURCES = ["sam_gov", "apollo", "manual_import", "hubspot_sync", "csv_import"];
const ENGAGEMENT_OPTIONS = [
    { value: "", label: "Any" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "never", label: "Never engaged" },
];
const STATUS_OPTIONS = [
    { value: "", label: "Any" },
    { value: "subscribed", label: "Subscribed" },
    { value: "unsubscribed", label: "Unsubscribed" },
    { value: "bounced", label: "Bounced" },
];

export default function OutreachContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [openContactId, setOpenContactId] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [lists, setLists] = useState<ListMeta[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [filters, setFilters] = useState({
        q: "",
        sources: [] as string[],
        tags: [] as string[],
        naics: [] as string[],
        states: [] as string[],
        engagement: "",
        status: "",
        listId: "",
    });
    const [naicsInput, setNaicsInput] = useState("");
    const [stateInput, setStateInput] = useState("");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchContacts = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        for (const s of filters.sources) params.append("source", s);
        for (const t of filters.tags) params.append("tag", t);
        for (const n of filters.naics) params.append("naics", n);
        for (const st of filters.states) params.append("state", st);
        if (filters.engagement) params.set("engagement", filters.engagement);
        if (filters.status) params.set("status", filters.status);
        if (filters.listId) params.set("list_id", filters.listId);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(page * PAGE_SIZE));

        try {
            const res = await fetch(`/api/admin/outreach/contacts?${params}`);
            const data = await res.json();
            setContacts(data.contacts || []);
            setTotal(data.total || 0);
        } catch {
            setContacts([]);
        } finally {
            setLoading(false);
        }
    }, [filters, page]);

    const fetchLists = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/outreach/lists");
            const data = await res.json();
            setLists(data.lists || []);
        } catch {
            setLists([]);
        }
    }, []);

    // Debounce filter changes so the table doesn't thrash while user types.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { fetchContacts(); }, 250);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [fetchContacts]);

    useEffect(() => { fetchLists(); }, [fetchLists]);

    const toggleSelectAll = () => {
        if (selectedIds.size === contacts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(contacts.map(c => c.id)));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBulkAddToList = async () => {
        const listId = window.prompt("Paste list ID (or leave blank to create new):") || "";
        let targetId = listId.trim();
        if (!targetId) {
            const name = window.prompt("Name the new list:")?.trim();
            if (!name) return;
            const res = await fetch("/api/admin/outreach/lists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!data.list) return alert(data.error || "Could not create list");
            targetId = data.list.id;
            await fetchLists();
        }
        const res = await fetch("/api/admin/outreach/contacts/bulk-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add_to_list", ids: Array.from(selectedIds), payload: { list_id: targetId } }),
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        setSelectedIds(new Set());
        fetchLists();
    };

    const handleBulkTag = async () => {
        const tag = window.prompt("Tag to add:")?.trim();
        if (!tag) return;
        await fetch("/api/admin/outreach/contacts/bulk-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add_tag", ids: Array.from(selectedIds), payload: { tag } }),
        });
        setSelectedIds(new Set());
        fetchContacts();
    };

    const handleBulkAddToCampaign = async () => {
        const campaignId = window.prompt("Campaign ID to enroll into:")?.trim();
        if (!campaignId) return;
        const res = await fetch("/api/admin/outreach/contacts/bulk-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add_to_campaign", ids: Array.from(selectedIds), payload: { campaign_id: campaignId } }),
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        setSelectedIds(new Set());
        alert(`Enrolled ${data.added} contacts.`);
    };

    const handleBulkSuppress = async () => {
        if (!window.confirm(`Suppress ${selectedIds.size} contacts? They'll be excluded from all future sends.`)) return;
        await fetch("/api/admin/outreach/contacts/bulk-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "suppress", ids: Array.from(selectedIds) }),
        });
        setSelectedIds(new Set());
        fetchContacts();
    };

    const toggleArr = (key: "sources" | "tags" | "states", value: string) => {
        setPage(0);
        setFilters(prev => ({
            ...prev,
            [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value],
        }));
    };

    const addArr = (key: "naics" | "states" | "tags", value: string) => {
        const v = value.trim();
        if (!v) return;
        setPage(0);
        setFilters(prev => ({
            ...prev,
            [key]: prev[key].includes(v) ? prev[key] : [...prev[key], v],
        }));
    };

    const allTags = useMemo(() => {
        const seen = new Set<string>();
        for (const c of contacts) for (const t of c.tags || []) seen.add(t);
        for (const t of filters.tags) seen.add(t);
        return Array.from(seen).sort();
    }, [contacts, filters.tags]);

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="min-h-screen bg-stone-50">
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/overview" className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 rotate-180" /> Admin
                        </Link>
                        <span className="text-stone-300">/</span>
                        <h1 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5" /> Outreach Contacts</h1>
                        <span className="text-xs text-stone-500">{total.toLocaleString()} total</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowImport(true)}
                            className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                        >
                            <Upload className="w-4 h-4" /> Import Contacts
                        </button>
                        <button
                            type="button"
                            onClick={() => fetchContacts()}
                            className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                        >
                            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
                {/* Filter sidebar */}
                <aside className="bg-white border border-stone-200 rounded-2xl p-4 space-y-5 h-fit lg:sticky lg:top-6">
                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide flex items-center gap-1"><Filter className="w-3 h-3" /> Search</label>
                        <div className="relative mt-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                            <input
                                type="text"
                                placeholder="email / name / company"
                                value={filters.q}
                                onChange={e => { setPage(0); setFilters(f => ({ ...f, q: e.target.value })); }}
                                className="w-full pl-8 pr-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                            />
                        </div>
                    </div>

                    {lists.length > 0 && (
                        <div>
                            <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Saved List</label>
                            <select
                                value={filters.listId}
                                onChange={e => { setPage(0); setFilters(f => ({ ...f, listId: e.target.value })); }}
                                className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                            >
                                <option value="">All contacts</option>
                                {lists.map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.contact_count})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Source</label>
                        <div className="space-y-1 mt-1">
                            {SOURCES.map(s => (
                                <label key={s} className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer hover:bg-stone-50 px-1.5 py-1 rounded">
                                    <input
                                        type="checkbox"
                                        checked={filters.sources.includes(s)}
                                        onChange={() => toggleArr("sources", s)}
                                        className="rounded border-stone-300"
                                    />
                                    {s.replace(/_/g, " ")}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">NAICS prefix</label>
                        <input
                            type="text"
                            value={naicsInput}
                            placeholder="e.g. 5413"
                            onChange={e => setNaicsInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { addArr("naics", naicsInput); setNaicsInput(""); } }}
                            className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                        />
                        {filters.naics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {filters.naics.map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setFilters(f => ({ ...f, naics: f.naics.filter(x => x !== n) }))}
                                        className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1"
                                    >
                                        {n} <X className="w-2.5 h-2.5" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">State</label>
                        <input
                            type="text"
                            value={stateInput}
                            placeholder="e.g. VA, DC"
                            onChange={e => setStateInput(e.target.value.toUpperCase())}
                            onKeyDown={e => { if (e.key === "Enter") { addArr("states", stateInput); setStateInput(""); } }}
                            className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                        />
                        {filters.states.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {filters.states.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setFilters(f => ({ ...f, states: f.states.filter(x => x !== s) }))}
                                        className="text-[10px] bg-stone-100 text-stone-700 border border-stone-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1"
                                    >
                                        {s} <X className="w-2.5 h-2.5" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Engagement</label>
                        <select
                            value={filters.engagement}
                            onChange={e => { setPage(0); setFilters(f => ({ ...f, engagement: e.target.value })); }}
                            className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                        >
                            {ENGAGEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Status</label>
                        <select
                            value={filters.status}
                            onChange={e => { setPage(0); setFilters(f => ({ ...f, status: e.target.value })); }}
                            className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                        >
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Tags</label>
                        <div className="flex gap-1 mt-1">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { addArr("tags", tagInput); setTagInput(""); } }}
                                placeholder="filter by tag"
                                className="flex-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                            />
                        </div>
                        {allTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-auto">
                                {allTags.map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => toggleArr("tags", t)}
                                        className={clsx(
                                            "text-[10px] rounded px-1.5 py-0.5 border",
                                            filters.tags.includes(t)
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                                        )}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => { setFilters({ q: "", sources: [], tags: [], naics: [], states: [], engagement: "", status: "", listId: "" }); setPage(0); }}
                        className="w-full text-xs text-stone-500 hover:text-black underline"
                    >
                        Clear all filters
                    </button>
                </aside>

                <section className="space-y-3 min-w-0">
                    {selectedIds.size > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex sm:flex-row flex-col justify-between items-center text-sm gap-3">
                            <span className="font-bold text-orange-700">{selectedIds.size} selected</span>
                            <div className="flex flex-wrap items-center gap-2">
                                <button onClick={handleBulkAddToCampaign} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs"><Send className="w-3.5 h-3.5" /> Add to campaign</button>
                                <button onClick={handleBulkAddToList} className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs"><Users className="w-3.5 h-3.5" /> Add to list</button>
                                <button onClick={handleBulkTag} className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs"><Tag className="w-3.5 h-3.5" /> Tag</button>
                                <button onClick={handleBulkSuppress} className="bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs"><AlertCircle className="w-3.5 h-3.5" /> Suppress</button>
                                <button onClick={() => setSelectedIds(new Set())} className="text-stone-500 text-xs">Clear</button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-bold">
                                    <tr>
                                        <th className="px-3 py-3 text-left w-8">
                                            <button onClick={toggleSelectAll} className="text-stone-400">
                                                {selectedIds.size === contacts.length && contacts.length > 0 ? <CheckSquare className="w-4 h-4 text-black" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </th>
                                        <th className="px-3 py-3 text-left">Email</th>
                                        <th className="px-3 py-3 text-left">Name</th>
                                        <th className="px-3 py-3 text-left">Company</th>
                                        <th className="px-3 py-3 text-left">Title</th>
                                        <th className="px-3 py-3 text-left">NAICS</th>
                                        <th className="px-3 py-3 text-left">State</th>
                                        <th className="px-3 py-3 text-left">Source</th>
                                        <th className="px-3 py-3 text-right">Score</th>
                                        <th className="px-3 py-3 text-left">Last engaged</th>
                                        <th className="px-3 py-3 text-left">Tags</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={11} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" /></td></tr>
                                    ) : contacts.length === 0 ? (
                                        <tr><td colSpan={11} className="text-center py-12 text-stone-400">
                                            No contacts match these filters yet. Try <button onClick={() => setShowImport(true)} className="underline">importing some</button>.
                                        </td></tr>
                                    ) : contacts.map(c => {
                                        const status =
                                            c.opted_out_at ? "unsub" :
                                            c.last_bounced_at ? "bounced" :
                                            "ok";
                                        const isSelected = selectedIds.has(c.id);
                                        return (
                                            <tr
                                                key={c.id}
                                                className={clsx("border-b border-stone-100 cursor-pointer hover:bg-stone-50/70", isSelected && "bg-orange-50/30")}
                                                onClick={() => setOpenContactId(c.id)}
                                            >
                                                <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                                                    {isSelected ? <CheckSquare className="w-4 h-4 text-black" /> : <Square className="w-4 h-4 text-stone-400" />}
                                                </td>
                                                <td className="px-3 py-2.5 text-stone-800 font-medium truncate max-w-[200px]">
                                                    <div className="flex items-center gap-1.5">
                                                        {c.email || <span className="italic text-stone-400">no email</span>}
                                                        {status === "unsub" && <span className="text-[9px] bg-stone-100 text-stone-600 px-1 rounded">UNSUB</span>}
                                                        {status === "bounced" && <span className="text-[9px] bg-rose-50 text-rose-700 px-1 rounded">BOUNCED</span>}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-stone-700">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                                                <td className="px-3 py-2.5 text-stone-700 truncate max-w-[160px]">{c.company_name || "—"}</td>
                                                <td className="px-3 py-2.5 text-stone-500 truncate max-w-[140px]">{c.title || "—"}</td>
                                                <td className="px-3 py-2.5 text-stone-500">{(c.naics_codes || []).slice(0, 2).join(", ") || "—"}</td>
                                                <td className="px-3 py-2.5 text-stone-500">{c.state || "—"}</td>
                                                <td className="px-3 py-2.5 text-stone-500">{c.source?.replace(/_/g, " ") || "—"}</td>
                                                <td className="px-3 py-2.5 text-right">
                                                    <span className={clsx(
                                                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold",
                                                        c.engagement_score >= 60 ? "bg-emerald-50 text-emerald-700" :
                                                        c.engagement_score >= 30 ? "bg-amber-50 text-amber-700" :
                                                        "bg-stone-50 text-stone-500"
                                                    )}>
                                                        {c.engagement_score}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 text-stone-500">{c.last_engagement_at ? new Date(c.last_engagement_at).toLocaleDateString() : "—"}</td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(c.tags || []).slice(0, 3).map(t => (
                                                            <span key={t} className="text-[9px] bg-stone-100 text-stone-600 rounded px-1 py-0.5">{t}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {pageCount > 1 && (
                            <div className="flex items-center justify-between p-3 border-t border-stone-200 text-xs text-stone-500">
                                <span>Page {page + 1} of {pageCount}</span>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        disabled={page === 0}
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        className="px-2 py-1 rounded border border-stone-200 disabled:opacity-40"
                                    >Prev</button>
                                    <button
                                        type="button"
                                        disabled={page + 1 >= pageCount}
                                        onClick={() => setPage(p => p + 1)}
                                        className="px-2 py-1 rounded border border-stone-200 disabled:opacity-40"
                                    >Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {showImport && (
                <ImportContactsModal
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); fetchContacts(); }}
                />
            )}

            {openContactId && (
                <ContactDrawer
                    contactId={openContactId}
                    onClose={() => setOpenContactId(null)}
                    onChange={fetchContacts}
                />
            )}
        </div>
    );
}
