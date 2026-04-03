"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Users, Briefcase, ListTodo, BarChart3, Loader2,
    ArrowRight, UserPlus, Search, Eye, Clock, FileText,
    Activity, TrendingUp, Shield, AlertCircle,
} from "lucide-react";
import clsx from "clsx";

interface ClientData {
    id: string;
    company_name: string;
    contact_name: string;
    email: string;
    client_status: string;
    pending_tasks: number;
    total_tasks: number;
    match_count: number;
    competitor_count: number;
    document_count: number;
    activity_count: number;
    last_login: string | null;
    created_at: string;
    naics_codes: string[];
}

export default function AdminOverview() {
    const [clients, setClients] = useState<ClientData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const res = await fetch("/api/admin/clients");
            const data = await res.json();
            setClients(data.clients || []);
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
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
        <div className="min-h-screen bg-stone-50 p-6 sm:p-8">
            <div className="w-full space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                            <BarChart3 className="w-6 h-6" /> Admin Dashboard
                        </h1>
                        <p className="text-sm text-stone-500 mt-1">CapturePilot Consulting Management</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/admin/clients" className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-800">
                            <Users className="w-4 h-4" /> Clients
                        </Link>
                        <Link href="/admin/prospects" className="bg-white text-stone-700 border border-stone-200 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-50">
                            <Search className="w-4 h-4" /> Prospects
                        </Link>
                        <Link href="/check" className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-blue-700">
                            <Eye className="w-4 h-4" /> Quick Check
                        </Link>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Users className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black">{clients.length}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-typewriter">Clients</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <UserPlus className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black">{activeClients.length}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-typewriter">Active</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <ListTodo className="w-4 h-4 text-amber-500 mb-1" />
                        <p className="text-2xl font-black">{totalTasks}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-typewriter">Pending Tasks</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Briefcase className="w-4 h-4 text-violet-500 mb-1" />
                        <p className="text-2xl font-black">{totalMatches.toLocaleString()}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-typewriter">Matches</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <FileText className="w-4 h-4 text-cyan-500 mb-1" />
                        <p className="text-2xl font-black">{totalDocs}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-typewriter">Documents</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Activity className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black">{recentlyActive.length}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-typewriter">Active 7d</p>
                    </div>
                </div>

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
                                <tr className="border-b border-stone-100 text-[10px] font-typewriter text-stone-400 uppercase">
                                    <th className="text-left px-5 py-2.5">Client</th>
                                    <th className="text-center px-3 py-2.5">Status</th>
                                    <th className="text-center px-3 py-2.5">Last Login</th>
                                    <th className="text-center px-3 py-2.5">Tasks</th>
                                    <th className="text-center px-3 py-2.5">Matches</th>
                                    <th className="text-center px-3 py-2.5">Docs</th>
                                    <th className="text-center px-3 py-2.5">Competitors</th>
                                    <th className="text-center px-3 py-2.5">Health</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                                {clients.map(c => {
                                    // Health score: 0-100
                                    let health = 20;
                                    if (c.last_login && Date.now() - new Date(c.last_login).getTime() < 7 * 86400000) health += 25;
                                    if (c.match_count > 0) health += 15;
                                    if (c.document_count > 0) health += 15;
                                    if (c.competitor_count > 0) health += 10;
                                    if (c.pending_tasks < 3) health += 15;
                                    health = Math.min(100, health);

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
                                                <div className="inline-flex items-center gap-1.5">
                                                    <div className="w-12 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                                        <div className={clsx("h-full rounded-full",
                                                            health >= 70 ? "bg-emerald-500" : health >= 40 ? "bg-amber-500" : "bg-red-500"
                                                        )} style={{ width: `${health}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-stone-500">{health}</span>
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
        </div>
    );
}
