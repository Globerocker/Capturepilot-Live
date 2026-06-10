"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
    Loader2, Check, X, Search, RefreshCw, Globe, MapPin, Hash,
    Calendar, CheckSquare, Square, AlertTriangle, Sparkles, PlayCircle,
    Settings as SettingsIcon, Pause, Play, Thermometer,
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

type TopTab = "prospects" | "settings";

export default function OutreachAdminPage() {
    const [topTab, setTopTab] = useState<TopTab>("prospects");
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
                        <Sparkles className="w-6 h-6 text-emerald-600" /> Outreach
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Newly-SAM-registered companies queued for cold outreach. Admin-only.
                    </p>
                </div>
                {topTab === "prospects" && (
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
                )}
            </div>

            {/* Top tabs: Prospects | Settings */}
            <div className="flex items-center gap-2 border-b border-stone-200">
                <button
                    type="button"
                    onClick={() => setTopTab("prospects")}
                    className={clsx(
                        "text-xs font-bold uppercase tracking-widest px-4 py-2.5 border-b-2 -mb-px inline-flex items-center gap-2 transition-colors",
                        topTab === "prospects"
                            ? "border-black text-black"
                            : "border-transparent text-stone-500 hover:text-stone-800",
                    )}
                >
                    <Sparkles className="w-3.5 h-3.5" /> Prospects
                </button>
                <button
                    type="button"
                    onClick={() => setTopTab("settings")}
                    className={clsx(
                        "text-xs font-bold uppercase tracking-widest px-4 py-2.5 border-b-2 -mb-px inline-flex items-center gap-2 transition-colors",
                        topTab === "settings"
                            ? "border-black text-black"
                            : "border-transparent text-stone-500 hover:text-stone-800",
                    )}
                >
                    <SettingsIcon className="w-3.5 h-3.5" /> Settings
                </button>
            </div>

            {topTab === "settings" ? <SettingsPanel /> : <>

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
            </>}
        </div>
    );
}

// ─── Settings tab ───────────────────────────────────────────
// Today shows the email-warmup status block (R3-M5.2). Future settings
// (sender domain rotation, peer list management, sequence delays) slot
// underneath this block.

interface WarmupHistoryPoint {
    date: string;
    target: number;
    actual: number;
    paused: boolean;
}

interface WarmupStatus {
    today: { date: string; target: number; actual: number; paused: boolean } | null;
    history: WarmupHistoryPoint[];
    paused: boolean;
    peer_count: number;
    peer_env_var: string;
}

function SettingsPanel() {
    const [data, setData] = useState<WarmupStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/outreach/warmup");
            if (!res.ok) {
                setErr(`Failed to load warmup status (${res.status})`);
                setData(null);
            } else {
                const body = await res.json() as WarmupStatus;
                setData(body);
            }
        } catch (e) {
            setErr((e as Error).message);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const togglePause = async () => {
        if (!data) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/outreach/warmup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paused: !data.paused }),
            });
            if (res.ok) await load();
        } catch (e) {
            setErr((e as Error).message);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
        );
    }

    if (err || !data) {
        return (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-6 text-sm">
                {err || "Couldn't load warmup data."}
            </div>
        );
    }

    const today = data.today;
    const pct = today && today.target > 0
        ? Math.min(100, Math.round((today.actual / today.target) * 100))
        : 0;
    const maxBar = Math.max(1, ...data.history.map(h => Math.max(h.target, h.actual)));

    return (
        <div className="space-y-6">
            {/* Warmup status block */}
            <section className="bg-white border border-stone-200 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                    <div className="flex items-center gap-2">
                        <Thermometer className="w-5 h-5 text-emerald-600" />
                        <h2 className="text-lg font-bold tracking-tight">Email Warmup</h2>
                        {data.paused && (
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                                Paused
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={togglePause}
                            disabled={saving}
                            className={clsx(
                                "text-xs font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 border transition-colors disabled:opacity-50",
                                data.paused
                                    ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50",
                            )}
                            title={data.paused ? "Resume warmup" : "Pause warmup"}
                        >
                            {saving
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : data.paused
                                    ? <Play className="w-3.5 h-3.5" />
                                    : <Pause className="w-3.5 h-3.5" />}
                            {data.paused ? "Resume warmup" : "Pause warmup"}
                        </button>
                        <button
                            type="button"
                            onClick={load}
                            title="Refresh warmup status"
                            aria-label="Refresh warmup status"
                            className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 hover:bg-stone-50"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <p className="text-xs text-stone-500 mb-5 leading-relaxed">
                    Warmup ramps daily send volume on a 30-day curve so mailbox providers
                    build trust with our sending domain. The cron at
                    {" "}<code className="bg-stone-100 px-1 py-0.5 rounded text-[11px]">/api/cron/email_warmup_send</code>{" "}
                    runs every 30 min during business hours and tops up under the day's target.
                </p>

                {/* Today's KPIs */}
                {today ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                        <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">Today's target</p>
                            <p className="text-2xl font-black text-black">{today.target.toLocaleString()}</p>
                            <p className="text-[11px] text-stone-500 mt-1">{today.date}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">Sent so far</p>
                            <p className="text-2xl font-black text-emerald-800">{today.actual.toLocaleString()}</p>
                            <p className="text-[11px] text-emerald-700 mt-1">{pct}% of target</p>
                        </div>
                        <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">Peer addresses</p>
                            <p className="text-2xl font-black text-black">{data.peer_count}</p>
                            <p className="text-[11px] text-stone-500 mt-1">
                                via <code className="bg-stone-100 px-1 rounded">{data.peer_env_var}</code>
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 mb-5 text-sm flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                            No schedule row for today. Run migration 148 or extend the schedule curve.
                        </div>
                    </div>
                )}

                {/* Today's progress bar */}
                {today && today.target > 0 && (
                    <div className="mb-6">
                        <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* 30-day chart */}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">
                        30-day ramp (target vs actual)
                    </p>
                    {data.history.length === 0 ? (
                        <p className="text-xs text-stone-500">No history yet.</p>
                    ) : (
                        <div className="flex items-end gap-1 h-32 border-b border-stone-200 pb-1">
                            {data.history.map(h => {
                                const targetH = Math.round((h.target / maxBar) * 100);
                                const actualH = Math.round((h.actual / maxBar) * 100);
                                const isToday = today && h.date === today.date;
                                return (
                                    <div key={h.date} className="flex-1 flex flex-col items-center justify-end" title={`${h.date}: target ${h.target} · sent ${h.actual}`}>
                                        <div className="w-full relative" style={{ height: "100%" }}>
                                            <div
                                                className={clsx(
                                                    "absolute bottom-0 left-0 right-0 rounded-t transition-all",
                                                    isToday ? "bg-stone-400" : "bg-stone-200",
                                                )}
                                                style={{ height: `${targetH}%` }}
                                            />
                                            <div
                                                className={clsx(
                                                    "absolute bottom-0 left-0 right-0 rounded-t transition-all opacity-90",
                                                    h.paused ? "bg-amber-400" : "bg-emerald-500",
                                                )}
                                                style={{ height: `${actualH}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-stone-500">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-stone-200 inline-block" /> Target
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Sent
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> Paused day
                        </span>
                    </div>
                </div>

                {data.peer_count === 0 && (
                    <div className="mt-5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-xs flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                            <strong>No peer addresses configured.</strong> Set the
                            {" "}<code className="bg-amber-100 px-1 rounded">WARMUP_PEER_ADDRESSES</code>{" "}
                            env var to a comma-separated list of friendly inboxes
                            (e.g. internal addresses you control). The cron will no-op
                            until this is set.
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
