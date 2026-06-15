"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Search, Filter, Plus, Upload, Users, Mail, Phone, Tag, MapPin,
    Loader2, CheckSquare, Square, X, Trash2, Send, ChevronRight, Building2,
    Briefcase, Hash, Clock, AlertCircle, ChevronDown, RefreshCw, Trophy,
    Globe, Target, ArrowUp, ArrowDown, ArrowUpDown, Columns3, Check,
} from "lucide-react";
import clsx from "clsx";
import OutreachNav from "@/components/outreach/OutreachNav";
import ImportContactsModal from "@/components/outreach/ImportContactsModal";
import ContactDrawer from "@/components/outreach/ContactDrawer";

interface ContractorIntel {
    uei: string | null;
    federal_awards_count: number | null;
    last_award_date: string | null;
    activation_date: string | null;
    years_on_sam: number | null;
    psc_codes: string[];
    certifications: string[];
    has_listing_page: boolean;
    listing_slug: string | null;
}

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
    source_id: string | null;
    tags: string[];
    engagement_score: number;
    last_engagement_at: string | null;
    last_bounced_at: string | null;
    opted_out_at: string | null;
    created_at: string;
    contractor: ContractorIntel | null;
}

interface ListMeta {
    id: string;
    name: string;
    contact_count: number;
}

const SOURCES = ["sam_gov", "apollo", "manual_import", "hubspot_sync", "csv_import"];
// Tag-based audiences the contacts get tagged with on capture.
const AUDIENCE_TAGS = ["quick_checker", "lead_magnet"];
// Common SBA set-asides / certifications (matched via the contractor join).
const CERT_OPTIONS = ["8(a)", "HUBZone", "WOSB", "EDWOSB", "SDVOSB", "VOSB", "SDB"];
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

// Sort keys understood by the API. Direct columns sort in SQL; the rest
// (past_awards / last_award / years_on_sam) sort in-memory off the contractor join.
type SortKey =
    | "email" | "company_name" | "state" | "created_at" | "engagement_score"
    | "past_awards" | "last_award" | "years_on_sam";

// Column model for the HubSpot-style show/hide picker. `sort` is the API sort
// key when the column header is clickable; `align` controls cell alignment.
type ColumnId =
    | "email" | "name" | "company" | "phone" | "title" | "naics" | "state"
    | "source" | "past_awards" | "last_award" | "years_sam" | "listing"
    | "engagement" | "last_engaged" | "tags";

interface ColumnDef {
    id: ColumnId;
    label: string;
    sort?: SortKey;       // present => header is clickable
    align?: "left" | "right";
    title?: string;       // header tooltip
}

const COLUMNS: ColumnDef[] = [
    { id: "email", label: "Email", sort: "email" },
    { id: "name", label: "Name" },
    { id: "company", label: "Company", sort: "company_name" },
    { id: "phone", label: "Phone" },
    { id: "title", label: "Title" },
    { id: "naics", label: "NAICS" },
    { id: "state", label: "State", sort: "state" },
    { id: "source", label: "Source" },
    { id: "past_awards", label: "Past awards", sort: "past_awards", title: "Federal awards on record (SAM.gov contractor match)" },
    { id: "last_award", label: "Last award", sort: "last_award", title: "Most recent federal award" },
    { id: "years_sam", label: "Yrs SAM", sort: "years_on_sam", align: "right", title: "Years registered on SAM.gov" },
    { id: "listing", label: "Listing", title: "Has a published CapturePilot listing page" },
    { id: "engagement", label: "Score", sort: "engagement_score", align: "right" },
    { id: "last_engaged", label: "Last engaged" },
    { id: "tags", label: "Tags" },
];

// Default-visible set (HubSpot-style). Hideable columns: phone, title, tags, engagement, source.
const DEFAULT_VISIBLE: Record<ColumnId, boolean> = {
    email: true, name: true, company: true, phone: false, title: false,
    naics: true, state: true, source: false, past_awards: true,
    last_award: true, years_sam: true, listing: true, engagement: false,
    last_engaged: true, tags: false,
};
const COLS_STORAGE_KEY = "outreach_contacts_cols";

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
        certs: [] as string[],
        psc: [] as string[],
        hasEmail: true,
        engagement: "",
        status: "",
        listId: "",
    });
    const [naicsInput, setNaicsInput] = useState("");
    const [stateInput, setStateInput] = useState("");
    const [pscInput, setPscInput] = useState("");
    const [page, setPage] = useState(0);
    const [sortKey, setSortKey] = useState<SortKey>("created_at");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [visibleCols, setVisibleCols] = useState<Record<ColumnId, boolean>>(DEFAULT_VISIBLE);
    const [showColsMenu, setShowColsMenu] = useState(false);
    const colsMenuRef = useRef<HTMLDivElement | null>(null);
    const PAGE_SIZE = 50;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Restore persisted column choices once on mount.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(COLS_STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw) as Partial<Record<ColumnId, boolean>>;
                setVisibleCols(prev => {
                    const next = { ...prev };
                    for (const col of COLUMNS) {
                        if (typeof saved[col.id] === "boolean") next[col.id] = saved[col.id]!;
                    }
                    return next;
                });
            }
        } catch {
            /* ignore malformed storage */
        }
    }, []);

    // Close the columns menu on outside click.
    useEffect(() => {
        if (!showColsMenu) return;
        const onClick = (e: MouseEvent) => {
            if (colsMenuRef.current && !colsMenuRef.current.contains(e.target as Node)) {
                setShowColsMenu(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [showColsMenu]);

    const toggleColumn = (id: ColumnId) => {
        setVisibleCols(prev => {
            const next = { ...prev, [id]: !prev[id] };
            try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };

    // Header click: same column toggles direction, new column resets to a sane default.
    const handleSort = (key: SortKey) => {
        setPage(0);
        if (sortKey === key) {
            setSortDir(d => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            // Text columns read better ascending; numeric/date columns descending.
            setSortDir(key === "email" || key === "company_name" || key === "state" ? "asc" : "desc");
        }
    };

    const fetchContacts = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        for (const s of filters.sources) params.append("source", s);
        for (const t of filters.tags) params.append("tag", t);
        for (const n of filters.naics) params.append("naics", n);
        for (const st of filters.states) params.append("state", st);
        for (const c of filters.certs) params.append("cert", c);
        for (const p of filters.psc) params.append("psc", p);
        params.set("has_email", filters.hasEmail ? "1" : "0");
        if (filters.engagement) params.set("engagement", filters.engagement);
        if (filters.status) params.set("status", filters.status);
        if (filters.listId) params.set("list_id", filters.listId);
        params.set("sort", sortKey);
        params.set("dir", sortDir);
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
    }, [filters, page, sortKey, sortDir]);

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

    const toggleArr = (key: "sources" | "tags" | "states" | "certs", value: string) => {
        setPage(0);
        setFilters(prev => ({
            ...prev,
            [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value],
        }));
    };

    const addArr = (key: "naics" | "states" | "tags" | "psc", value: string) => {
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

    // Columns currently rendered, in declared order. +1 for the always-on select cell.
    const shownColumns = useMemo(() => COLUMNS.filter(c => visibleCols[c.id]), [visibleCols]);
    const colSpan = shownColumns.length + 1;

    // A single sortable/static header cell.
    const renderHeader = (col: ColumnDef) => {
        const alignRight = col.align === "right";
        const base = clsx("px-3 py-3", alignRight ? "text-right" : "text-left");
        if (!col.sort) {
            return <th key={col.id} className={base} title={col.title}>{col.label}</th>;
        }
        const active = sortKey === col.sort;
        const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
        return (
            <th key={col.id} className={base} title={col.title}>
                <button
                    type="button"
                    onClick={() => handleSort(col.sort!)}
                    className={clsx(
                        "inline-flex items-center gap-1 font-bold uppercase text-[10px] hover:text-stone-900",
                        active ? "text-stone-900" : "text-stone-500"
                    )}
                >
                    {col.label}
                    <Icon className={clsx("w-3 h-3", active ? "text-stone-700" : "text-stone-300")} />
                </button>
            </th>
        );
    };

    // Body cell for a given column + contact.
    const renderCell = (col: ColumnDef, c: Contact) => {
        switch (col.id) {
            case "email": {
                const status = c.opted_out_at ? "unsub" : c.last_bounced_at ? "bounced" : "ok";
                return (
                    <td key={col.id} className="px-3 py-2.5 text-stone-800 font-medium truncate max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                            {c.email || <span className="italic text-stone-400">no email</span>}
                            {status === "unsub" && <span className="text-[9px] bg-stone-100 text-stone-600 px-1 rounded">UNSUB</span>}
                            {status === "bounced" && <span className="text-[9px] bg-rose-50 text-rose-700 px-1 rounded">BOUNCED</span>}
                        </div>
                    </td>
                );
            }
            case "name":
                return <td key={col.id} className="px-3 py-2.5 text-stone-700">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>;
            case "company":
                return <td key={col.id} className="px-3 py-2.5 text-stone-700 truncate max-w-[160px]">{c.company_name || "—"}</td>;
            case "phone":
                return <td key={col.id} className="px-3 py-2.5 text-stone-500">{c.phone || "—"}</td>;
            case "title":
                return <td key={col.id} className="px-3 py-2.5 text-stone-500 truncate max-w-[140px]">{c.title || "—"}</td>;
            case "naics":
                return <td key={col.id} className="px-3 py-2.5 text-stone-500">{(c.naics_codes || []).slice(0, 2).join(", ") || "—"}</td>;
            case "state":
                return <td key={col.id} className="px-3 py-2.5 text-stone-500">{c.state || "—"}</td>;
            case "source":
                return <td key={col.id} className="px-3 py-2.5 text-stone-500">{c.source?.replace(/_/g, " ") || "—"}</td>;
            case "past_awards":
                return (
                    <td key={col.id} className="px-3 py-2.5">
                        {c.contractor && (c.contractor.federal_awards_count || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">
                                <Trophy className="w-3 h-3" /> Yes ({c.contractor.federal_awards_count})
                            </span>
                        ) : (
                            <span className="text-stone-300">—</span>
                        )}
                    </td>
                );
            case "last_award":
                return (
                    <td key={col.id} className="px-3 py-2.5 text-stone-500">
                        {c.contractor?.last_award_date
                            ? new Date(c.contractor.last_award_date).toLocaleDateString()
                            : <span className="text-stone-300">—</span>}
                    </td>
                );
            case "years_sam":
                return (
                    <td key={col.id} className="px-3 py-2.5 text-right text-stone-600">
                        {c.contractor?.years_on_sam != null
                            ? c.contractor.years_on_sam
                            : <span className="text-stone-300">—</span>}
                    </td>
                );
            case "listing":
                return (
                    <td key={col.id} className="px-3 py-2.5">
                        {c.contractor?.has_listing_page ? (
                            c.contractor.listing_slug ? (
                                <a
                                    href={`https://www.capturepilot.com/contractors/${c.contractor.listing_slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 hover:bg-blue-100"
                                >
                                    <Globe className="w-3 h-3" /> View
                                </a>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                                    <Globe className="w-3 h-3" /> Yes
                                </span>
                            )
                        ) : (
                            <span className="text-stone-300">—</span>
                        )}
                    </td>
                );
            case "engagement":
                return (
                    <td key={col.id} className="px-3 py-2.5 text-right">
                        <span className={clsx(
                            "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold",
                            c.engagement_score >= 60 ? "bg-emerald-50 text-emerald-700" :
                            c.engagement_score >= 30 ? "bg-amber-50 text-amber-700" :
                            "bg-stone-50 text-stone-500"
                        )}>
                            {c.engagement_score}
                        </span>
                    </td>
                );
            case "last_engaged":
                return <td key={col.id} className="px-3 py-2.5 text-stone-500">{c.last_engagement_at ? new Date(c.last_engagement_at).toLocaleDateString() : "—"}</td>;
            case "tags":
                return (
                    <td key={col.id} className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                            {(c.tags || []).slice(0, 3).map(t => (
                                <span key={t} className="text-[9px] bg-stone-100 text-stone-600 rounded px-1 py-0.5">{t}</span>
                            ))}
                        </div>
                    </td>
                );
            default:
                return null;
        }
    };

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
                        <div className="relative" ref={colsMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowColsMenu(o => !o)}
                                className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                                title="Show / hide columns"
                            >
                                <Columns3 className="w-4 h-4" /> Columns
                                <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                            </button>
                            {showColsMenu && (
                                <div className="absolute right-0 mt-1 w-56 bg-white border border-stone-200 rounded-xl shadow-lg z-20 p-1.5">
                                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-stone-400 tracking-wide flex items-center justify-between">
                                        <span>Columns</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setVisibleCols(DEFAULT_VISIBLE);
                                                try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(DEFAULT_VISIBLE)); } catch { /* ignore */ }
                                            }}
                                            className="text-[10px] font-medium text-stone-500 hover:text-black normal-case"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                    <div className="max-h-72 overflow-auto">
                                        {COLUMNS.map(col => (
                                            <button
                                                key={col.id}
                                                type="button"
                                                onClick={() => toggleColumn(col.id)}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-stone-700 hover:bg-stone-50 rounded-lg"
                                            >
                                                <span className={clsx(
                                                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                                    visibleCols[col.id] ? "bg-black border-black" : "bg-white border-stone-300"
                                                )}>
                                                    {visibleCols[col.id] && <Check className="w-3 h-3 text-white" />}
                                                </span>
                                                {col.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
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

            <OutreachNav active="contacts" />

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

                    <label className="flex items-center justify-between gap-2 text-xs text-stone-700 cursor-pointer">
                        <span className="flex items-center gap-1.5 font-medium"><Mail className="w-3.5 h-3.5 text-stone-400" /> Has email only</span>
                        <input
                            type="checkbox"
                            checked={filters.hasEmail}
                            onChange={() => { setPage(0); setFilters(f => ({ ...f, hasEmail: !f.hasEmail })); }}
                            className="rounded border-stone-300"
                        />
                    </label>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Audience</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {AUDIENCE_TAGS.map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => toggleArr("tags", t)}
                                    className={clsx(
                                        "text-[11px] rounded-lg px-2 py-1 border font-medium",
                                        filters.tags.includes(t)
                                            ? "bg-orange-50 text-orange-700 border-orange-200"
                                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                                    )}
                                >
                                    {t.replace(/_/g, " ")}
                                </button>
                            ))}
                        </div>
                    </div>

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

                    <div className="pt-1 border-t border-stone-100">
                        <div className="text-[10px] font-bold uppercase text-stone-500 tracking-wide flex items-center gap-1 mb-1"><Target className="w-3 h-3" /> ICP targeting</div>
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
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">Set-aside / cert</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {CERT_OPTIONS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => toggleArr("certs", c)}
                                    className={clsx(
                                        "text-[10px] rounded px-1.5 py-0.5 border",
                                        filters.certs.includes(c)
                                            ? "bg-violet-50 text-violet-700 border-violet-200"
                                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                                    )}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">Matched via SAM.gov contractor records.</p>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide">PSC code</label>
                        <input
                            type="text"
                            value={pscInput}
                            placeholder="e.g. R425, D302"
                            onChange={e => setPscInput(e.target.value.toUpperCase())}
                            onKeyDown={e => { if (e.key === "Enter") { addArr("psc", pscInput); setPscInput(""); } }}
                            className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                        />
                        {filters.psc.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {filters.psc.map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setFilters(f => ({ ...f, psc: f.psc.filter(x => x !== p) }))}
                                        className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1"
                                    >
                                        {p} <X className="w-2.5 h-2.5" />
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-stone-400 mt-1">Matched via contractor PSC codes; unmatched contacts hidden.</p>
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
                        onClick={() => { setFilters({ q: "", sources: [], tags: [], naics: [], states: [], certs: [], psc: [], hasEmail: true, engagement: "", status: "", listId: "" }); setPage(0); }}
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
                                        {shownColumns.map(col => renderHeader(col))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={colSpan} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" /></td></tr>
                                    ) : contacts.length === 0 ? (
                                        <tr><td colSpan={colSpan} className="text-center py-12 text-stone-400">
                                            No contacts match these filters yet. Try <button onClick={() => setShowImport(true)} className="underline">importing some</button>.
                                        </td></tr>
                                    ) : contacts.map(c => {
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
                                                {shownColumns.map(col => renderCell(col, c))}
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
