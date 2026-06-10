"use client";

import { useEffect, useState } from "react";
import {
    Mail, Eye, MousePointerClick, AlertTriangle, CheckCircle2,
    Loader2, RefreshCw, ExternalLink, Sparkles, Building2,
    Facebook, Globe, Filter, ShieldX,
} from "lucide-react";
import clsx from "clsx";

interface Engagement {
    delivered: boolean;
    opened_count: number;
    last_opened_at: string | null;
    clicked_count: number;
    last_clicked_at: string | null;
    bounced: boolean;
    complained: boolean;
}

interface LeadRow {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    source: string | null;
    magnet_key: string;
    created_at: string;
    apollo_enriched: boolean;
    hubspot_id: string | null;
    brief_status: string | null;
    brief_sent_at: string | null;
    magnet: Engagement;
    brief: Engagement;
}

interface SuppressedRow {
    email: string;
    reason: string | null;
    source: string | null;
    opted_out_at: string;
}

interface Totals {
    leads: number;
    meta_leads: number;
    website_leads: number;
    briefs_done: number;
    briefs_pending: number;
    magnet_delivered: number;
    magnet_opened: number;
    magnet_clicked: number;
    brief_delivered: number;
    brief_opened: number;
}

type SourceFilter = "all" | "meta-lead-ad" | "website";
type EngagementFilter = "all" | "opened" | "clicked" | "bounced" | "no_engagement";

function fmtAgo(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return d.toLocaleDateString();
}

function Kpi({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: "ok" | "warn" | "info" }) {
    const color = accent === "ok" ? "text-emerald-600" : accent === "warn" ? "text-amber-600" : "text-stone-900";
    return (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
            <div className={clsx("mt-1 text-3xl font-bold tabular-nums", color)}>{value}</div>
            {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
        </div>
    );
}

function EngagementChip({ label, e }: { label: string; e: Engagement }) {
    if (!e.delivered && e.opened_count === 0 && e.clicked_count === 0 && !e.bounced) {
        return (
            <div className="text-xs text-stone-400">
                <span className="font-medium">{label}</span> — no events
            </div>
        );
    }
    return (
        <div className="text-xs">
            <span className="font-medium text-stone-600">{label}</span>
            <span className="ml-2 inline-flex items-center gap-1.5">
                {e.delivered && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600" title="Delivered to inbox">
                        <CheckCircle2 className="h-3 w-3" /> delivered
                    </span>
                )}
                {e.opened_count > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-blue-600" title={`Last open ${fmtAgo(e.last_opened_at)}`}>
                        <Eye className="h-3 w-3" /> {e.opened_count}× ({fmtAgo(e.last_opened_at)})
                    </span>
                )}
                {e.clicked_count > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-purple-600" title={`Last click ${fmtAgo(e.last_clicked_at)}`}>
                        <MousePointerClick className="h-3 w-3" /> {e.clicked_count}× ({fmtAgo(e.last_clicked_at)})
                    </span>
                )}
                {e.bounced && (
                    <span className="inline-flex items-center gap-0.5 text-red-600">
                        <AlertTriangle className="h-3 w-3" /> bounced
                    </span>
                )}
                {e.complained && (
                    <span className="inline-flex items-center gap-0.5 text-orange-600">
                        <AlertTriangle className="h-3 w-3" /> spam
                    </span>
                )}
            </span>
        </div>
    );
}

export default function EmailTrackingPage() {
    const [rows, setRows] = useState<LeadRow[]>([]);
    const [suppressed, setSuppressed] = useState<SuppressedRow[]>([]);
    const [totals, setTotals] = useState<Totals | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
    const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>("all");

    async function load(showRefresh: boolean = false) {
        if (showRefresh) setRefreshing(true);
        try {
            const res = await fetch("/api/admin/email-tracking");
            if (!res.ok) {
                throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
            }
            const json = await res.json();
            setRows(json.rows || []);
            setSuppressed(json.suppressed || []);
            setTotals(json.totals || null);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        load();
        const t = setInterval(() => load(true), 30_000);
        return () => clearInterval(t);
    }, []);

    const filtered = rows.filter(r => {
        if (sourceFilter === "meta-lead-ad" && r.source !== "meta-lead-ad") return false;
        if (sourceFilter === "website" && r.source === "meta-lead-ad") return false;
        switch (engagementFilter) {
            case "opened":
                return r.magnet.opened_count > 0 || r.brief.opened_count > 0;
            case "clicked":
                return r.magnet.clicked_count > 0 || r.brief.clicked_count > 0;
            case "bounced":
                return r.magnet.bounced || r.brief.bounced;
            case "no_engagement":
                return r.magnet.opened_count === 0 && r.magnet.clicked_count === 0;
            default:
                return true;
        }
    });

    return (
        <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-stone-900">Email Tracking</h1>
                    <p className="mt-1 text-sm text-stone-600">
                        White-paper downloads + briefing emails. Engagement updates within ~1min of Resend webhook fire.
                    </p>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                    <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} />
                    Refresh
                </button>
            </div>

            {totals && (
                <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                    <Kpi label="Total Leads" value={totals.leads} />
                    <Kpi label="From Meta Ads" value={totals.meta_leads} sub={`${totals.website_leads} from website`} />
                    <Kpi label="Magnets Delivered" value={totals.magnet_delivered} accent="ok" />
                    <Kpi label="Magnets Opened" value={totals.magnet_opened} sub={`${totals.magnet_clicked} clicked`} accent="info" />
                    <Kpi label="Briefs Sent" value={totals.briefs_done} sub={`${totals.briefs_pending} pending`} />
                    <Kpi label="Briefs Opened" value={totals.brief_opened} sub={`${totals.brief_delivered} delivered`} accent="info" />
                </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
                    <Filter className="ml-2 h-3.5 w-3.5 text-stone-400" />
                    {(["all", "meta-lead-ad", "website"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setSourceFilter(s)}
                            className={clsx(
                                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                                sourceFilter === s
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "text-stone-600 hover:bg-stone-100",
                            )}
                        >
                            {s === "all" ? "All sources" : s === "meta-lead-ad" ? "Meta ads" : "Website"}
                        </button>
                    ))}
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
                    {(["all", "opened", "clicked", "bounced", "no_engagement"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setEngagementFilter(s)}
                            className={clsx(
                                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                                engagementFilter === s
                                    ? "bg-blue-100 text-blue-800"
                                    : "text-stone-600 hover:bg-stone-100",
                            )}
                        >
                            {s === "no_engagement" ? "No engagement" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="text-xs text-stone-500">
                    Showing {filtered.length} of {rows.length}
                </div>
            </div>

            {loading && (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                    <table className="min-w-full divide-y divide-stone-200">
                        <thead className="bg-stone-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Lead</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Source</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Magnet Email</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Partner Brief</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Captured</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {filtered.map(r => (
                                <tr key={r.id} className="hover:bg-stone-50">
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-medium text-stone-900">{r.name || r.email}</div>
                                        {r.name && <div className="text-xs text-stone-500">{r.email}</div>}
                                        {r.company && (
                                            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-stone-600">
                                                <Building2 className="h-3 w-3" /> {r.company}
                                            </div>
                                        )}
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            {r.apollo_enriched && (
                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                                    <Sparkles className="h-2.5 w-2.5" /> apollo
                                                </span>
                                            )}
                                            {r.hubspot_id && (
                                                <a
                                                    href={`https://app.hubspot.com/contacts/0/contact/${r.hubspot_id}`}
                                                    target="_blank"
                                                    rel="noopener"
                                                    className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 hover:bg-orange-100"
                                                >
                                                    hubspot <ExternalLink className="h-2.5 w-2.5" />
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1 text-xs text-stone-700">
                                            {r.source === "meta-lead-ad" ? <Facebook className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                                            {r.source || "—"}
                                        </span>
                                        <div className="mt-0.5 text-[11px] text-stone-500">{r.magnet_key}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <EngagementChip label="Magnet" e={r.magnet} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-xs text-stone-700">
                                            <span className={clsx(
                                                "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                                                r.brief_status === "done"
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : r.brief_status === "pending"
                                                        ? "bg-amber-100 text-amber-800"
                                                        : r.brief_status
                                                            ? "bg-red-100 text-red-800"
                                                            : "bg-stone-100 text-stone-600",
                                            )}>
                                                {r.brief_status || "not enqueued"}
                                            </span>
                                            {r.brief_sent_at && (
                                                <span className="ml-2 text-stone-500">sent {fmtAgo(r.brief_sent_at)}</span>
                                            )}
                                        </div>
                                        <div className="mt-1">
                                            <EngagementChip label="Brief" e={r.brief} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-stone-600">{fmtAgo(r.created_at)}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-stone-500">
                                        <Mail className="mx-auto mb-2 h-8 w-8 text-stone-300" />
                                        No leads match the current filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && !error && (
                <div className="mt-8">
                    <div className="mb-3 flex items-center gap-2">
                        <ShieldX className="h-4 w-4 text-red-600" />
                        <h2 className="text-lg font-semibold text-stone-900">Suppressed addresses</h2>
                        <span className="text-xs text-stone-500">({suppressed.length} most recent)</span>
                    </div>
                    <p className="mb-3 text-xs text-stone-500">
                        From <code className="rounded bg-stone-100 px-1">outreach_optouts</code>. Populated by Resend bounce/complaint webhooks,
                        the public unsubscribe link, and HubSpot reps flagging contacts as bounced or unsubscribed.
                    </p>
                    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                        <table className="min-w-full divide-y divide-stone-200">
                            <thead className="bg-stone-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Email</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Source</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Reason</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">Added</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {suppressed.map(s => (
                                    <tr key={s.email} className="hover:bg-stone-50">
                                        <td className="px-4 py-2 text-sm text-stone-900 tabular-nums">{s.email}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx(
                                                "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                                                s.source === "hubspot_webhook"
                                                    ? "bg-orange-100 text-orange-800"
                                                    : s.source === "resend_webhook"
                                                        ? "bg-red-100 text-red-800"
                                                        : s.source === "unsubscribe_link"
                                                            ? "bg-blue-100 text-blue-800"
                                                            : "bg-stone-100 text-stone-700",
                                            )}>
                                                {s.source || "unknown"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-stone-600">{s.reason || "—"}</td>
                                        <td className="px-4 py-2 text-xs text-stone-600">{fmtAgo(s.opted_out_at)}</td>
                                    </tr>
                                ))}
                                {suppressed.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-stone-500">
                                            No suppressed addresses on file.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
