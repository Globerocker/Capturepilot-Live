"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Users, Briefcase, ListTodo, BarChart3, Loader2,
    ArrowRight, UserPlus, Search, Eye, Clock, FileText,
    Activity, TrendingUp, Shield, AlertCircle, CheckCircle2,
    Database, Sparkles, ExternalLink,
} from "lucide-react";
import clsx from "clsx";

interface CronStat {
    route: string;
    last_run: string | null;
    last_status: string | null;
    last_error: string | null;
    last_rows_out: number | null;
    last_success: string | null;
    hours_since_success: number | null;
}

interface DbStats {
    generated_at: string;
    opportunities: {
        total_estimated: number;
        active_estimated: number;
        expiring_in_7d_exact: number;
        expired_estimated: number;
        latest_added: { posted_date: string | null; created_at: string | null; title: string | null; agency: string | null; notice_id: string | null } | null;
    };
    enrichment: {
        denominator: number;
        strategic_scoring: { populated: number; pct: number };
        ai_win_strategy: { populated: number; pct: number };
        structured_requirements: { populated: number; pct: number };
    };
    crons: CronStat[];
    recent_logins: Array<{ email: string | undefined; last_sign_in_at: string | undefined; created_at: string }>;
    recent_activity: Array<{ id: string; user_profile_id: string; action: string; description: string; created_at: string }>;
}

interface ClientData {
    id: string;
    company_name: string;
    contact_name: string;
    email: string;
    client_status: string;
    pending_tasks: number;
    total_tasks: number;
    match_count: number;
    saved_match_count?: number;
    pursuit_count?: number;
    active_pursuit_count?: number;
    competitor_count: number;
    document_count: number;
    activity_count: number;
    last_login: string | null;
    created_at: string;
    naics_codes: string[];
    activity_score?: number | null;
}

export default function AdminOverview() {
    const [clients, setClients] = useState<ClientData[]>([]);
    const [loading, setLoading] = useState(true);
    const [dbStats, setDbStats] = useState<DbStats | null>(null);
    const [dbStatsError, setDbStatsError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            // Clients power the bottom table; the DB-stats endpoint feeds the
            // new Data Health panel. Run both in parallel — neither blocks the
            // other so a slow stats query doesn't delay the client list.
            const [clientsRes, statsRes] = await Promise.allSettled([
                fetch("/api/admin/clients").then(r => r.json()),
                fetch("/api/admin/db-stats", { cache: "no-store" }).then(r => r.json()),
            ]);
            if (clientsRes.status === "fulfilled") {
                setClients(clientsRes.value.clients || []);
            }
            if (statsRes.status === "fulfilled") {
                if (statsRes.value.error) setDbStatsError(statsRes.value.error);
                else setDbStats(statsRes.value as DbStats);
            } else {
                setDbStatsError("Failed to load DB stats");
            }
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    }

    const activeClients = clients.filter(c => c.client_status === "active");
    const totalTasks = clients.reduce((s, c) => s + (c.pending_tasks || 0), 0);
    const totalMatches = clients.reduce((s, c) => s + (c.match_count || 0), 0);
    const totalDocs = clients.reduce((s, c) => s + (c.document_count || 0), 0);

    // Engagement: clients who logged in within last 7 days
    const recentlyActive = clients.filter(c => {
        if (!c.last_login) return false;
        return Date.now() - new Date(c.last_login).getTime() < 7 * 86400000;
    });

    // Clients needing attention: no login in 14+ days OR high pending tasks
    const needsAttention = clients.filter(c => {
        const noLogin = !c.last_login || Date.now() - new Date(c.last_login).getTime() > 14 * 86400000;
        return noLogin || c.pending_tasks > 3;
    });

    const timeAgo = (date: string | null) => {
        if (!date) return "Never";
        const diff = Date.now() - new Date(date).getTime();
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Overview</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6" /> Dashboard
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">At-a-glance health for every account and pipeline stage.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Link href="/admin/clients" className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-800 transition-colors">
                        <Users className="w-4 h-4" /> People
                    </Link>
                    <Link href="/admin/leads" className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm">
                        <Search className="w-4 h-4" /> Leads &amp; Quick Check
                    </Link>
                </div>
            </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Users className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black">{clients.length}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Clients</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <UserPlus className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black">{activeClients.length}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Active</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <ListTodo className="w-4 h-4 text-amber-500 mb-1" />
                        <p className="text-2xl font-black">{totalTasks}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Pending Tasks</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Briefcase className="w-4 h-4 text-violet-500 mb-1" />
                        <p className="text-2xl font-black">{totalMatches.toLocaleString()}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Total Scored</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <FileText className="w-4 h-4 text-cyan-500 mb-1" />
                        <p className="text-2xl font-black">{totalDocs}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Documents</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Activity className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black">{recentlyActive.length}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Active 7d</p>
                    </div>
                </div>

                {/* Data Health — pipeline freshness + enrichment completeness + cron status.
                    Lives on the overview so a stale ingest or empty enrichment field is
                    visible without having to dig into /admin/crons or /admin/health. */}
                {dbStatsError && (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
                        Could not load DB stats: {dbStatsError}
                    </div>
                )}
                {dbStats && (
                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                            <h2 className="font-bold text-sm flex items-center gap-2">
                                <Database className="w-4 h-4 text-stone-400" /> Data Health
                            </h2>
                            <Link href="/admin/crons" className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1">
                                Full cron telemetry <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-stone-100">
                            {/* Opportunities pipeline */}
                            <div className="p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Opportunities pipeline</p>
                                <p className="text-2xl font-black">{dbStats.opportunities.active_estimated.toLocaleString()}</p>
                                <p className="text-xs text-stone-500">active (of ~{dbStats.opportunities.total_estimated.toLocaleString()})</p>
                                <div className="mt-3 space-y-1 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-stone-500">Expiring in 7d</span>
                                        <span className={clsx("font-bold", dbStats.opportunities.expiring_in_7d_exact > 0 ? "text-amber-600" : "text-stone-400")}>
                                            {dbStats.opportunities.expiring_in_7d_exact}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-stone-500">Expired (cleanup eligible)</span>
                                        <span className="text-stone-700">{dbStats.opportunities.expired_estimated.toLocaleString()}</span>
                                    </div>
                                    {dbStats.opportunities.latest_added && (
                                        <div className="mt-2 pt-2 border-t border-stone-100">
                                            <p className="text-[10px] text-stone-400 uppercase">Newest row</p>
                                            <p className="text-[11px] text-stone-600 truncate">{dbStats.opportunities.latest_added.title || dbStats.opportunities.latest_added.notice_id}</p>
                                            <p className="text-[10px] text-stone-400">{timeAgo(dbStats.opportunities.latest_added.created_at)}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Enrichment completeness */}
                            <div className="p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Enrichment coverage
                                </p>
                                {[
                                    { label: "Strategic scoring", stat: dbStats.enrichment.strategic_scoring },
                                    { label: "AI win strategy", stat: dbStats.enrichment.ai_win_strategy },
                                    { label: "Structured reqs", stat: dbStats.enrichment.structured_requirements },
                                ].map(({ label, stat }) => (
                                    <div key={label} className="mb-2 last:mb-0">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-stone-600">{label}</span>
                                            <span className={clsx("font-bold", stat.pct >= 80 ? "text-emerald-600" : stat.pct >= 40 ? "text-amber-600" : "text-rose-600")}>
                                                {stat.pct}%
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1">
                                            <div className={clsx(
                                                "h-full",
                                                stat.pct >= 80 ? "bg-emerald-500" : stat.pct >= 40 ? "bg-amber-500" : "bg-rose-500",
                                            )} style={{ width: `${Math.min(100, stat.pct)}%` }} />
                                        </div>
                                        <p className="text-[10px] text-stone-400 mt-0.5">
                                            {stat.populated.toLocaleString()} / {dbStats.enrichment.denominator.toLocaleString()} active
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Critical crons — stalest first */}
                            <div className="p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Critical crons (stalest first)</p>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {dbStats.crons.slice(0, 8).map(c => {
                                        const stale = c.hours_since_success != null && c.hours_since_success > 36;
                                        const failedRecent = c.last_status === "error";
                                        const Icon = failedRecent ? AlertCircle : stale ? Clock : CheckCircle2;
                                        const tone = failedRecent ? "text-rose-600" : stale ? "text-amber-600" : "text-emerald-600";
                                        return (
                                            <div key={c.route} className="flex items-center gap-2 text-xs">
                                                <Icon className={clsx("w-3 h-3 flex-shrink-0", tone)} />
                                                <span className="flex-1 truncate font-mono text-[11px] text-stone-600">{c.route.replace("/api/cron/", "")}</span>
                                                <span className={clsx("text-[10px]", tone)}>
                                                    {c.last_success ? `${c.hours_since_success}h` : "never"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Recent logins + recent activity log — bottom strip */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-stone-100 divide-y md:divide-y-0 md:divide-x divide-stone-100">
                            <div className="p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Recent sign-ins (last 10)</p>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {dbStats.recent_logins.length === 0 && (
                                        <p className="text-xs text-stone-400">No recent sign-ins.</p>
                                    )}
                                    {dbStats.recent_logins.map((u, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="text-stone-700 truncate flex-1">{u.email || "(no email)"}</span>
                                            <span className="text-stone-400 text-[10px] flex-shrink-0">{timeAgo(u.last_sign_in_at || null)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Recent admin activity</p>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {dbStats.recent_activity.length === 0 && (
                                        <p className="text-xs text-stone-400">No activity logged yet.</p>
                                    )}
                                    {dbStats.recent_activity.slice(0, 8).map(a => (
                                        <div key={a.id} className="text-xs">
                                            <p className="text-stone-700 truncate"><span className="text-stone-400 font-mono">{a.action}</span> · {a.description}</p>
                                            <p className="text-[10px] text-stone-400">{timeAgo(a.created_at)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Attention Needed + Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Needs Attention */}
                    {needsAttention.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                <h2 className="font-bold text-sm text-amber-800">Needs Attention ({needsAttention.length})</h2>
                            </div>
                            <div className="divide-y divide-amber-100 max-h-48 overflow-y-auto">
                                {needsAttention.slice(0, 5).map(c => (
                                    <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                                        <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-[10px]">{c.company_name.charAt(0)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{c.company_name}</p>
                                            <p className="text-[10px] text-amber-600">
                                                {!c.last_login ? "Never logged in" : `Last login: ${timeAgo(c.last_login)}`}
                                                {c.pending_tasks > 3 ? ` · ${c.pending_tasks} pending tasks` : ""}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quick Actions */}
                    <div className="space-y-3">
                        <Link href="/admin/clients" className="block bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors group">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-sm">Create New Client</p>
                                    <p className="text-xs text-stone-500 mt-0.5">Account + tasks + welcome email + NAICS crawl</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-black" />
                            </div>
                        </Link>
                        <Link href="/check" className="block bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors group">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-sm">Run Quick Check</p>
                                    <p className="text-xs text-stone-500 mt-0.5">Analyze a company for B2G readiness</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-black" />
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Client Table */}
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                        <h2 className="font-bold text-sm">All Clients</h2>
                        <Link href="/admin/clients" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            Manage <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-stone-100 text-[10px] text-stone-400 uppercase">
                                    <th className="text-left px-5 py-2.5">Client</th>
                                    <th className="text-center px-3 py-2.5">Status</th>
                                    <th className="text-center px-3 py-2.5">Last Login</th>
                                    <th className="text-center px-3 py-2.5">Tasks</th>
                                    <th className="text-center px-3 py-2.5">Matches</th>
                                    <th className="text-center px-3 py-2.5">Docs</th>
                                    <th className="text-center px-3 py-2.5">Competitors</th>
                                    <th className="text-center px-3 py-2.5" title="1-10 activity score: login recency + saved matches + active pursuits + docs + tasks">Activity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                                {clients.map(c => {
                                    // Activity score now comes from the API (computed against
                                    // login recency + saved matches + active pursuits + docs).
                                    // Fallback to a derived value for the rare row where the
                                    // API returned null (admin accounts).
                                    const score = c.activity_score
                                        ?? (c.last_login && Date.now() - new Date(c.last_login).getTime() < 7 * 86400000 ? 5 : 1);

                                    return (
                                        <tr key={c.id} className="hover:bg-stone-50/50">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                                                        {c.company_name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-stone-900">{c.company_name}</p>
                                                        <p className="text-[10px] text-stone-400">{c.contact_name || c.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-center px-3">
                                                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                                                    c.client_status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                    c.client_status === "prospect" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                    "bg-stone-100 text-stone-500 border-stone-200"
                                                )}>{c.client_status}</span>
                                            </td>
                                            <td className="text-center px-3">
                                                <span className={clsx("text-xs",
                                                    !c.last_login ? "text-red-500 font-bold" :
                                                    Date.now() - new Date(c.last_login).getTime() > 7 * 86400000 ? "text-amber-500" :
                                                    "text-stone-500"
                                                )}>
                                                    <Clock className="w-3 h-3 inline mr-0.5" />
                                                    {timeAgo(c.last_login)}
                                                </span>
                                            </td>
                                            <td className="text-center px-3">
                                                {c.pending_tasks > 0 ? (
                                                    <span className="text-xs font-bold text-amber-600">{c.pending_tasks}/{c.total_tasks}</span>
                                                ) : (
                                                    <span className="text-xs text-stone-400">{c.total_tasks}</span>
                                                )}
                                            </td>
                                            <td className="text-center px-3 text-xs text-stone-600">{c.match_count}</td>
                                            <td className="text-center px-3 text-xs text-stone-600">{c.document_count}</td>
                                            <td className="text-center px-3 text-xs text-stone-600">{c.competitor_count}</td>
                                            <td className="text-center px-3">
                                                <div className="inline-flex items-center gap-1.5" title={`Activity score: ${score}/10`}>
                                                    <div className="w-12 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                                        <div className={clsx("h-full rounded-full",
                                                            score >= 7 ? "bg-emerald-500" : score >= 4 ? "bg-amber-500" : "bg-red-500"
                                                        )} style={{ width: `${score * 10}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-stone-500">{score}/10</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
