"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Users, Briefcase, ListTodo, BarChart3, Loader2,
    ArrowRight, UserPlus, Search, Eye,
} from "lucide-react";

interface Stats {
    total_clients: number;
    active_clients: number;
    total_opps: number;
    active_opps: number;
    pending_tasks: number;
    total_analyses: number;
}

interface RecentClient {
    id: string;
    company_name: string;
    contact_name: string;
    email: string;
    client_status: string;
    pending_tasks: number;
    created_at: string;
}

export default function AdminOverview() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            // Fetch clients
            const res = await fetch("/api/admin/clients");
            const data = await res.json();
            const clients = data.clients || [];

            setRecentClients(clients.slice(0, 5).map((c: Record<string, unknown>) => ({
                id: c.id,
                company_name: c.company_name,
                contact_name: c.contact_name,
                email: c.email,
                client_status: c.client_status,
                pending_tasks: c.pending_tasks,
                created_at: c.created_at,
            })));

            setStats({
                total_clients: clients.length,
                active_clients: clients.filter((c: Record<string, unknown>) => c.client_status === "active").length,
                total_opps: 0, // populated below
                active_opps: 0,
                pending_tasks: clients.reduce((sum: number, c: Record<string, unknown>) => sum + (Number(c.pending_tasks) || 0), 0),
                total_analyses: 0,
            });

            setLoading(false);
        })();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
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

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <Users className="w-5 h-5 text-blue-500 mb-2" />
                            <p className="text-3xl font-black">{stats.total_clients}</p>
                            <p className="text-xs text-stone-500">Consulting Clients</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <UserPlus className="w-5 h-5 text-emerald-500 mb-2" />
                            <p className="text-3xl font-black">{stats.active_clients}</p>
                            <p className="text-xs text-stone-500">Active</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <ListTodo className="w-5 h-5 text-amber-500 mb-2" />
                            <p className="text-3xl font-black">{stats.pending_tasks}</p>
                            <p className="text-xs text-stone-500">Pending Tasks</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <Briefcase className="w-5 h-5 text-violet-500 mb-2" />
                            <p className="text-3xl font-black">37K+</p>
                            <p className="text-xs text-stone-500">Opportunities</p>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Link href="/admin/clients" className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors group">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-sm">Create New Client</p>
                                <p className="text-xs text-stone-500 mt-1">Set up a consulting client account with tasks and portal access</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-black transition-colors" />
                        </div>
                    </Link>
                    <Link href="/check" className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors group">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-sm">Run Company Analysis</p>
                                <p className="text-xs text-stone-500 mt-1">Quick Check a company for B2G readiness and opportunity matches</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-black transition-colors" />
                        </div>
                    </Link>
                    <Link href="/admin/prospects" className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors group">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-sm">View Prospects</p>
                                <p className="text-xs text-stone-500 mt-1">Review saved Quick Check analyses and potential leads</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-black transition-colors" />
                        </div>
                    </Link>
                </div>

                {/* Recent Clients */}
                {recentClients.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                            <h2 className="font-bold text-sm">Recent Clients</h2>
                            <Link href="/admin/clients" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                View all <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                        <div className="divide-y divide-stone-100">
                            {recentClients.map((client) => (
                                <div key={client.id} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50/50">
                                    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                                        {client.company_name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-black truncate">{client.company_name}</p>
                                        <p className="text-xs text-stone-500">{client.contact_name || client.email}</p>
                                    </div>
                                    <div className="text-xs text-stone-400">
                                        {client.pending_tasks > 0 && (
                                            <span className="text-amber-600 font-bold">{client.pending_tasks} tasks</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {recentClients.length === 0 && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                        <Users className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                        <p className="text-stone-500 text-sm mb-4">No consulting clients yet.</p>
                        <Link href="/admin/clients" className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1.5">
                            <UserPlus className="w-4 h-4" /> Create First Client
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
