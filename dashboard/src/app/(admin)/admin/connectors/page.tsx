"use client";

import { useEffect, useState } from "react";
import {
    Loader2, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw,
    ExternalLink, Calendar, Edit3, Save, X, Plug,
} from "lucide-react";
import clsx from "clsx";

interface OpenAlert {
    id: string;
    alert_type: string;
    severity: string;
    title: string;
    fired_at: string;
}

interface Connector {
    id: string;
    slug: string;
    label: string;
    env_var_name: string;
    category: string;
    enabled: boolean;
    rotation_days: number | null;
    expires_at: string | null;
    days_left: number | null;
    docs_url: string | null;
    rotate_url: string | null;
    notes: string | null;
    last_check_at: string | null;
    last_status: string | null;
    last_detail: string | null;
    consecutive_fails: number;
    open_alerts: OpenAlert[];
}

function fmtRelative(ts: string | null): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusBadge({ status }: { status: string | null }) {
    if (status === "ok") {
        return (
            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Healthy
            </span>
        );
    }
    if (status === "error") {
        return (
            <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-bold bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" /> Failing
            </span>
        );
    }
    if (status === "disabled") {
        return (
            <span className="inline-flex items-center gap-1 text-stone-500 text-xs font-bold bg-stone-100 border border-stone-200 rounded-full px-2 py-0.5">
                <HelpCircle className="w-3 h-3" /> Not configured
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-stone-500 text-xs font-bold bg-stone-100 border border-stone-200 rounded-full px-2 py-0.5">
            <HelpCircle className="w-3 h-3" /> Unknown
        </span>
    );
}

function ExpiryBadge({ days }: { days: number | null }) {
    if (days === null) return <span className="text-xs text-stone-400">no expiry</span>;
    if (days <= 0)
        return <span className="text-xs font-bold text-rose-700">expired {Math.abs(days)}d ago</span>;
    if (days <= 3)
        return <span className="text-xs font-bold text-rose-700">{days}d left</span>;
    if (days <= 14)
        return <span className="text-xs font-bold text-amber-700">{days}d left</span>;
    return <span className="text-xs text-stone-500">{days}d left</span>;
}

export default function ConnectorsPage() {
    const [connectors, setConnectors] = useState<Connector[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ expires_at: string; rotation_days: string; notes: string }>({
        expires_at: "",
        rotation_days: "",
        notes: "",
    });

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/connectors", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setConnectors(data.connectors);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    function startEdit(c: Connector) {
        setEditingId(c.id);
        setEditForm({
            expires_at: c.expires_at ? c.expires_at.slice(0, 10) : "",
            rotation_days: c.rotation_days?.toString() || "",
            notes: c.notes || "",
        });
    }

    async function save(id: string) {
        try {
            const res = await fetch("/api/admin/connectors", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    expires_at: editForm.expires_at || null,
                    rotation_days: editForm.rotation_days ? parseInt(editForm.rotation_days, 10) : null,
                    notes: editForm.notes,
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || `HTTP ${res.status}`);
            }
            setEditingId(null);
            await load();
        } catch (e) {
            setErr((e as Error).message);
        }
    }

    const grouped = (() => {
        if (!connectors) return [];
        const byCat = new Map<string, Connector[]>();
        for (const c of connectors) {
            if (!byCat.has(c.category)) byCat.set(c.category, []);
            byCat.get(c.category)!.push(c);
        }
        return Array.from(byCat.entries()).sort();
    })();

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-stone-900 flex items-center gap-2">
                        <Plug className="w-7 h-7 text-emerald-600" />
                        Connectors
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Every external API the platform depends on, with expiry countdowns and last health-check status.
                        The hourly health monitor uses this list as its registry.
                    </p>
                </div>
                <button
                    onClick={load}
                    className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                    <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
                    Refresh
                </button>
            </header>

            {err && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                    {err}
                </div>
            )}

            {loading && !connectors ? (
                <div className="flex items-center gap-2 text-stone-500 text-sm py-12 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading connectors…
                </div>
            ) : (
                <div className="space-y-8">
                    {grouped.map(([category, items]) => (
                        <section key={category}>
                            <h2 className="text-xs uppercase tracking-widest font-bold text-stone-500 mb-3">
                                {category}
                            </h2>
                            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase tracking-wider">
                                            <th className="text-left px-4 py-3">Service</th>
                                            <th className="text-left px-4 py-3">Status</th>
                                            <th className="text-left px-4 py-3">Last check</th>
                                            <th className="text-left px-4 py-3">Expiry</th>
                                            <th className="text-left px-4 py-3">Rotation</th>
                                            <th className="text-right px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((c) => {
                                            const editing = editingId === c.id;
                                            return (
                                                <>
                                                    <tr key={c.id} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/50">
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="font-bold text-stone-900 text-sm">{c.label}</div>
                                                            <div className="text-xs font-mono text-stone-500 mt-0.5">{c.env_var_name}</div>
                                                            {c.docs_url && (
                                                                <a
                                                                    href={c.docs_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1 mt-1"
                                                                >
                                                                    Docs <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                            {c.open_alerts.length > 0 && (
                                                                <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                                                                    {c.open_alerts.length} open alert{c.open_alerts.length === 1 ? "" : "s"}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            <StatusBadge status={c.last_status} />
                                                            {c.consecutive_fails > 0 && (
                                                                <div className="text-[10px] text-rose-600 mt-1">
                                                                    {c.consecutive_fails} fails in a row
                                                                </div>
                                                            )}
                                                            {c.last_detail && (
                                                                <div className="text-[11px] text-stone-500 mt-1 max-w-[180px] truncate" title={c.last_detail}>
                                                                    {c.last_detail}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-top text-xs text-stone-500">
                                                            {fmtRelative(c.last_check_at)}
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            {editing ? (
                                                                <input
                                                                    type="date"
                                                                    value={editForm.expires_at}
                                                                    onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })}
                                                                    className="text-xs border border-stone-300 rounded px-2 py-1 w-32"
                                                                />
                                                            ) : (
                                                                <div className="flex flex-col">
                                                                    <ExpiryBadge days={c.days_left} />
                                                                    {c.expires_at && (
                                                                        <span className="text-[10px] text-stone-400 mt-0.5">
                                                                            <Calendar className="w-2.5 h-2.5 inline mr-0.5" />
                                                                            {c.expires_at.slice(0, 10)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            {editing ? (
                                                                <input
                                                                    type="number"
                                                                    value={editForm.rotation_days}
                                                                    onChange={(e) => setEditForm({ ...editForm, rotation_days: e.target.value })}
                                                                    placeholder="days"
                                                                    className="text-xs border border-stone-300 rounded px-2 py-1 w-20"
                                                                />
                                                            ) : (
                                                                <span className="text-xs text-stone-600">
                                                                    {c.rotation_days ? `${c.rotation_days}d` : "—"}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right align-top">
                                                            {editing ? (
                                                                <div className="flex gap-1 justify-end">
                                                                    <button
                                                                        onClick={() => save(c.id)}
                                                                        className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                                                                        title="Save"
                                                                    >
                                                                        <Save className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingId(null)}
                                                                        className="p-1.5 text-stone-500 hover:bg-stone-100 rounded"
                                                                        title="Cancel"
                                                                    >
                                                                        <X className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex gap-1 justify-end">
                                                                    {c.rotate_url && (
                                                                        <a
                                                                            href={c.rotate_url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="p-1.5 text-stone-600 hover:bg-stone-100 rounded"
                                                                            title="Rotate key"
                                                                        >
                                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                                        </a>
                                                                    )}
                                                                    <button
                                                                        onClick={() => startEdit(c)}
                                                                        className="p-1.5 text-stone-600 hover:bg-stone-100 rounded"
                                                                        title="Edit"
                                                                    >
                                                                        <Edit3 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    {editing && (
                                                        <tr key={`${c.id}-notes`} className="bg-stone-50/50 border-b border-stone-100">
                                                            <td colSpan={6} className="px-4 py-2">
                                                                <input
                                                                    type="text"
                                                                    value={editForm.notes}
                                                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                                                    placeholder="Operator notes (rotation tips, contact, etc.)"
                                                                    className="w-full text-xs border border-stone-300 rounded px-2 py-1.5"
                                                                />
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <p className="text-xs text-stone-400 mt-12">
                Health monitor runs every hour at minute 0. Email alerts go to <code className="bg-stone-100 px-1.5 py-0.5 rounded">info@fillcart.de</code>.
                Set <code className="bg-stone-100 px-1.5 py-0.5 rounded">VERCEL_TOKEN</code> + <code className="bg-stone-100 px-1.5 py-0.5 rounded">VERCEL_PROJECT_ID</code> to enable in-place key rotation here.
            </p>
        </div>
    );
}
