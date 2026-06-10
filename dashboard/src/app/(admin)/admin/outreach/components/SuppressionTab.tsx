"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
    Loader2, Search, RefreshCw, Plus, Upload, Trash2,
    ShieldX, AlertTriangle, Check,
} from "lucide-react";

interface SuppressedRow {
    id: string;
    email: string;
    reason: string | null;
    source: string | null;
    admin_notes: string | null;
    opted_out_at: string;
}

function fmtAgo(iso: string): string {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return d.toLocaleDateString();
}

const SOURCE_LABELS: Record<string, string> = {
    resend_webhook: "Resend bounces",
    hubspot_webhook: "HubSpot unsubscribes",
    unsubscribe_link: "Unsubscribe link",
    admin_manual: "Manually added",
    admin_bulk_import: "Bulk import",
};

const SOURCE_COLORS: Record<string, string> = {
    resend_webhook: "bg-red-100 text-red-800",
    hubspot_webhook: "bg-orange-100 text-orange-800",
    unsubscribe_link: "bg-blue-100 text-blue-800",
    admin_manual: "bg-stone-100 text-stone-700",
    admin_bulk_import: "bg-purple-100 text-purple-800",
};

export default function SuppressionTab() {
    const [rows, setRows] = useState<SuppressedRow[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const q = new URLSearchParams({ limit: "200" });
            if (search.trim()) q.set("q", search.trim());
            if (sourceFilter !== "all") q.set("source", sourceFilter);
            const res = await fetch(`/api/admin/outreach/suppression?${q.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json() as { suppressed: SuppressedRow[]; total: number; source_counts: Record<string, number> };
            setRows(json.suppressed || []);
            setTotal(json.total || 0);
            setCounts(json.source_counts || {});
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setLoading(false);
    }, [search, sourceFilter]);

    useEffect(() => { load(); }, [load]);

    const unsuppress = async (email: string) => {
        if (!confirm(`Remove ${email} from the suppression list? Future sends to this address will go through.`)) return;
        const res = await fetch("/api/admin/outreach/suppression", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        if (res.ok) {
            setMsg({ type: "success", text: `Removed ${email}.` });
            load();
        } else {
            const j = await res.json().catch(() => ({}));
            setMsg({ type: "error", text: j.error || "Failed to remove" });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-stone-500 inline-flex items-center gap-2">
                    <ShieldX className="w-4 h-4 text-red-600" />
                    Global opt-out list. Honored by every outreach send.
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="bg-black text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add one
                    </button>
                    <button
                        type="button"
                        onClick={() => setImportOpen(true)}
                        className="bg-stone-900 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                    >
                        <Upload className="w-3.5 h-3.5" /> Bulk import
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

            {/* Source-grouped filter chips */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={() => setSourceFilter("all")}
                    className={clsx(
                        "text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border",
                        sourceFilter === "all"
                            ? "bg-black text-white border-black"
                            : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                    )}
                >
                    All ({total})
                </button>
                {Object.entries(counts).map(([s, c]) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSourceFilter(s)}
                        className={clsx(
                            "text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border",
                            sourceFilter === s
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                        )}
                    >
                        {SOURCE_LABELS[s] || s} ({c})
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                    type="text"
                    placeholder="Search by email…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black"
                />
            </div>

            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
                ) : rows.length === 0 ? (
                    <div className="py-12 text-center text-sm text-stone-500">
                        No suppressed addresses match this filter.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 border-b border-stone-200">
                            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                <th className="px-3 py-2">Email</th>
                                <th className="px-3 py-2">Source</th>
                                <th className="px-3 py-2">Reason</th>
                                <th className="px-3 py-2">Notes</th>
                                <th className="px-3 py-2">Added</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                                    <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                                    <td className="px-3 py-2">
                                        <span className={clsx(
                                            "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                                            SOURCE_COLORS[r.source || ""] || "bg-stone-100 text-stone-700",
                                        )}>
                                            {SOURCE_LABELS[r.source || ""] || r.source || "unknown"}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-stone-600">{r.reason || "—"}</td>
                                    <td className="px-3 py-2 text-xs text-stone-500 max-w-[260px] truncate" title={r.admin_notes || ""}>
                                        {r.admin_notes || "—"}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-stone-500">{fmtAgo(r.opted_out_at)}</td>
                                    <td className="px-3 py-2 text-right">
                                        <button type="button" onClick={() => unsuppress(r.email)}
                                            className="p-1.5 rounded text-rose-600 hover:bg-rose-50" title="Unsuppress (admin override)">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {addOpen && <AddSingleModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}
            {importOpen && <BulkImportModal onClose={() => setImportOpen(false)} onSaved={() => { setImportOpen(false); load(); }} />}
        </div>
    );
}

function AddSingleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [email, setEmail] = useState("");
    const [reason, setReason] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/outreach/suppression", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, reason, admin_notes: notes }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            onSaved();
        } catch (e) {
            setError((e as Error).message);
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
                <h2 className="text-lg font-bold">Add to suppression list</h2>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        placeholder="user@example.com"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Reason</label>
                    <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        placeholder="e.g. Support ticket #421 requested removal"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Notes (internal)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                        className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="text-xs font-bold text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-100">Cancel</button>
                    <button type="button" onClick={save} disabled={saving || !email}
                        className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg disabled:opacity-50">
                        {saving ? "Saving…" : "Add"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function BulkImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [csv, setCsv] = useState("");
    const [reason, setReason] = useState("Bulk import");
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<{ inserted: number; total: number; skipped: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setSaving(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch("/api/admin/outreach/suppression/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ csv, reason }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            const json = await res.json();
            setResult(json);
        } catch (e) {
            setError((e as Error).message);
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4">
                <h2 className="text-lg font-bold">Bulk import opt-outs</h2>
                <p className="text-xs text-stone-500">
                    Paste a list of emails — one per line, or a CSV. Any email-looking string is captured;
                    everything else is ignored.
                </p>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Reason</label>
                    <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">CSV / list</label>
                    <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={10}
                        className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black font-mono"
                        placeholder="user@example.com&#10;another@example.com&#10;…"
                    />
                </div>
                {result && (
                    <div className="rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800 text-xs px-3 py-2">
                        Inserted {result.inserted} of {result.total} ({result.skipped} skipped/duplicate).
                    </div>
                )}
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="text-xs font-bold text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-100">
                        {result ? "Close" : "Cancel"}
                    </button>
                    <button type="button" onClick={result ? onSaved : run} disabled={saving || (!csv && !result)}
                        className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {result ? "Done" : "Import"}
                    </button>
                </div>
            </div>
        </div>
    );
}
