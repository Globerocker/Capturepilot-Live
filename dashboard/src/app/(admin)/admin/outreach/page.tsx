"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
    Loader2, Check, X, Search, RefreshCw, Globe, MapPin, Hash,
    Calendar, CheckSquare, Square, AlertTriangle, Sparkles, PlayCircle,
} from "lucide-react";

interface Prospect {
    id: string;
    uei: string | null;
    cage_code: string | null;
    company_name: string;
    website: string | null;
    state: string | null;
    city: string | null;
    naics_codes: string[];
    certifications: string[];
    registration_date: string | null;
    primary_email: string | null;
    primary_name: string | null;
    source: string;
    status: string;
    match_score: number;
    discovered_at: string;
    rejection_reason: string | null;
    notes: string | null;
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
    { key: "pending_review", label: "Pending Review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "sent", label: "Sent" },
    { key: "replied", label: "Replied" },
    { key: "bounced", label: "Bounced" },
    { key: "all", label: "All" },
];

export default function OutreachAdminPage() {
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState("pending_review");
    const [search, setSearch] = useState("");
    const [certFilter, setCertFilter] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const q = new URLSearchParams({ status, limit: "100" });
            if (search.trim()) q.set("q", search.trim());
            if (certFilter) q.set("cert", certFilter);
            const res = await fetch(`/api/admin/outreach/prospects?${q.toString()}`);
            if (!res.ok) { setLoading(false); return; }
            const body = await res.json() as { prospects: Prospect[]; total: number };
            setProspects(body.prospects || []);
            setTotal(body.total || 0);
        } catch { /* non-fatal */ }
        setLoading(false);
        setSelectedIds(new Set());
    }, [status, search, certFilter]);

    useEffect(() => { load(); }, [load]);

    const runDiscovery = async () => {
        setRunning(true);
        setMsg(null);
        try {
            const res = await fetch("/api/cron/discover_new_prospects?days=14");
            const body = await res.json() as { inserted?: number; skipped_existing?: number; upstream_rows?: number };
            if (res.ok) {
                setMsg({ type: "success", text: `Discovery complete: ${body.inserted ?? 0} new prospects (of ${body.upstream_rows ?? 0} rows, ${body.skipped_existing ?? 0} already known).` });
                load();
            } else {
                setMsg({ type: "error", text: "Discovery failed. Check CRON_SECRET header." });
            }
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setRunning(false);
    };

    const updateStatus = async (id: string, newStatus: string, rejectionReason?: string) => {
        await fetch(`/api/admin/outreach/prospects/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, rejection_reason: rejectionReason }),
        });
        load();
    };

    const bulkAction = async (action: "bulk_approve" | "bulk_reject") => {
        if (selectedIds.size === 0) return;
        const reason = action === "bulk_reject" ? prompt("Rejection reason?") : null;
        if (action === "bulk_reject" && !reason) return;
        await fetch("/api/admin/outreach/prospects/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ids: [...selectedIds], rejection_reason: reason || undefined }),
        });
        load();
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === prospects.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(prospects.map(p => p.id)));
    };

    return (
        <div className="max-w-[1600px] mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-emerald-600" /> Outreach Prospects
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Newly-SAM-registered companies queued for cold outreach. Admin-only.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={runDiscovery}
                        disabled={running}
                        className="bg-black text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2 disabled:opacity-50"
                        title="Pull the last 14 days from SAM.gov now"
                    >
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                        {running ? "Running…" : "Run Discovery (14 days)"}
                    </button>
                    <button
                        type="button"
                        onClick={load}
                        className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-3 py-2 rounded-xl inline-flex items-center gap-1.5 hover:bg-stone-50"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            </div>

            {msg && (
                <div className={clsx(
                    "text-xs px-3 py-2 rounded-lg border flex items-center gap-2",
                    msg.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200",
                )}>
                    {msg.type === "success" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {msg.text}
                </div>
            )}

            {/* Status tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {STATUS_TABS.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setStatus(t.key)}
                        className={clsx(
                            "text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors",
                            status === t.key
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[260px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                    <input
                        type="text"
                        placeholder="Company name, UEI, or website…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") load(); }}
                        className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                <select
                    value={certFilter}
                    onChange={e => setCertFilter(e.target.value)}
                    aria-label="Cert filter"
                    className="text-sm px-3 py-2 border border-stone-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-black"
                >
                    <option value="">All certifications</option>
                    <option value="8(a)">8(a)</option>
                    <option value="HUBZone">HUBZone</option>
                    <option value="SDVOSB">SDVOSB</option>
                    <option value="WOSB">WOSB</option>
                    <option value="EDWOSB">EDWOSB</option>
                    <option value="VOSB">VOSB</option>
                </select>
                <span className="ml-auto text-xs text-stone-500">{total.toLocaleString()} prospects</span>
            </div>

            {/* Bulk action bar — shows when rows are selected */}
            {selectedIds.size > 0 && (
                <div className="sticky top-0 z-10 bg-black text-white rounded-xl px-4 py-2 flex items-center gap-3">
                    <span className="text-xs font-bold">{selectedIds.size} selected</span>
                    <div className="flex-1" />
                    <button type="button" onClick={() => bulkAction("bulk_approve")}
                        className="text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                        <Check className="w-3 h-3" /> Approve {selectedIds.size}
                    </button>
                    <button type="button" onClick={() => bulkAction("bulk_reject")}
                        className="text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                        <X className="w-3 h-3" /> Reject {selectedIds.size}
                    </button>
                    <button type="button" onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-white/70 hover:text-white">Clear</button>
                </div>
            )}

            {/* Table */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
                ) : prospects.length === 0 ? (
                    <div className="py-12 text-center text-sm text-stone-500">
                        No prospects. Click <strong>Run Discovery</strong> to fetch the last 14 days from SAM.gov.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 border-b border-stone-200">
                            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                <th className="px-3 py-2 w-10">
                                    <button type="button" onClick={toggleSelectAll} title="Select all">
                                        {selectedIds.size === prospects.length && prospects.length > 0
                                            ? <CheckSquare className="w-4 h-4" />
                                            : <Square className="w-4 h-4" />}
                                    </button>
                                </th>
                                <th className="px-3 py-2">Company</th>
                                <th className="px-3 py-2">Score</th>
                                <th className="px-3 py-2">Certs</th>
                                <th className="px-3 py-2">NAICS</th>
                                <th className="px-3 py-2">Location</th>
                                <th className="px-3 py-2">Registered</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prospects.map(p => (
                                <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                                    <td className="px-3 py-2">
                                        <button type="button" onClick={() => toggleSelect(p.id)} title={`Select ${p.company_name}`}>
                                            {selectedIds.has(p.id)
                                                ? <CheckSquare className="w-4 h-4 text-emerald-600" />
                                                : <Square className="w-4 h-4 text-stone-400" />}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <p className="font-bold text-black">{p.company_name}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-0.5 flex-wrap">
                                            {p.uei && <span className="font-mono inline-flex items-center gap-0.5"><Hash className="w-2.5 h-2.5" />{p.uei}</span>}
                                            {p.website && (
                                                <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-black truncate max-w-[200px]">
                                                    <Globe className="w-2.5 h-2.5" />{p.website.replace(/^https?:\/\//, "")}
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <span className={clsx(
                                            "text-xs font-black px-2 py-0.5 rounded border",
                                            p.match_score >= 70 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : p.match_score >= 40 ? "bg-amber-50 text-amber-700 border-amber-200"
                                                : "bg-stone-50 text-stone-600 border-stone-200",
                                        )}>{p.match_score}</span>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex flex-wrap gap-1">
                                            {p.certifications.length === 0
                                                ? <span className="text-[10px] text-stone-300">—</span>
                                                : p.certifications.map(c => (
                                                    <span key={c} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">{c}</span>
                                                ))}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex flex-wrap gap-1">
                                            {p.naics_codes.slice(0, 3).map(n => (
                                                <span key={n} className="text-[10px] font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">{n}</span>
                                            ))}
                                            {p.naics_codes.length > 3 && <span className="text-[10px] text-stone-400">+{p.naics_codes.length - 3}</span>}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs text-stone-600">
                                        {p.city || p.state ? (
                                            <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{[p.city, p.state].filter(Boolean).join(", ")}</span>
                                        ) : <span className="text-stone-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs text-stone-600">
                                        {p.registration_date ? (
                                            <span className="inline-flex items-center gap-0.5"><Calendar className="w-3 h-3" />{new Date(p.registration_date).toLocaleDateString()}</span>
                                        ) : <span className="text-stone-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right align-top">
                                        {p.status === "pending_review" ? (
                                            <div className="inline-flex items-center gap-1">
                                                <button type="button" onClick={() => updateStatus(p.id, "approved")}
                                                    className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50" title="Approve">
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button type="button" onClick={() => {
                                                    const reason = prompt("Rejection reason?");
                                                    if (reason) updateStatus(p.id, "rejected", reason);
                                                }}
                                                    className="p-1.5 rounded text-rose-600 hover:bg-rose-50" title="Reject">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className={clsx(
                                                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                                                p.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : p.status === "rejected" ? "bg-rose-50 text-rose-700 border-rose-200"
                                                    : p.status === "sent" ? "bg-blue-50 text-blue-700 border-blue-200"
                                                    : "bg-stone-50 text-stone-600 border-stone-200",
                                            )}>{p.status}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
