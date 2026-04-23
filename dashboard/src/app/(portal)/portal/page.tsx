// @ts-nocheck — Supabase join types cause unknown ReactNode errors in React 19 strict mode
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ListTodo, Briefcase, FileText, Layers, AlertCircle,
    CheckCircle2, Clock, Loader2, ArrowRight,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Task {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    category: string;
}

interface OppMatch {
    title: string;
    agency: string;
    deadline: string;
    score: number;
    notice_type: string;
    set_aside_code: string;
}

export default function PortalOverview() {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState({ pendingTasks: 0, matchedOpps: 0, pipelineDeals: 0, docs: 0 });
    const [topOpps, setTopOpps] = useState<OppMatch[]>([]);
    const [upcomingDeadlines, setUpcomingDeadlines] = useState<OppMatch[]>([]);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("auth_user_id", user.id)
                .single();

            if (!prof) return;
            setProfile(prof);

            // Fetch tasks, matches, pipeline, docs in parallel
            const [tasksRes, matchesRes, pipelineRes, docsRes] = await Promise.all([
                supabase
                    .from("client_tasks")
                    .select("*")
                    .eq("user_profile_id", prof.id)
                    .neq("status", "completed")
                    .order("created_at", { ascending: false })
                    .limit(5),
                supabase
                    .from("user_matches")
                    .select("score, opportunity:opportunities!inner(title, agency, response_deadline, notice_type, set_aside_code, status)")
                    .eq("user_profile_id", prof.id),
                supabase
                    .from("user_pursuits")
                    .select("id", { count: "exact", head: true })
                    .eq("user_profile_id", prof.id),
                supabase
                    .from("client_documents")
                    .select("id", { count: "exact", head: true })
                    .eq("user_profile_id", prof.id),
            ]);

            setTasks((tasksRes.data || []) as Task[]);

            // Process matches for top opps and deadlines
            const allMatches = (matchesRes.data || []) as Array<Record<string, unknown>>;
            const now = Date.now();

            const activeMatches: OppMatch[] = [];
            allMatches.forEach((m) => {
                const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Record<string, unknown>;
                if (!opp) return;
                const status = String(opp.status || "");
                if (status === "EXPIRED" || status === "AWARDED" || status === "ARCHIVED") return;

                const deadline = String(opp.response_deadline || "");
                const deadlineMs = deadline ? new Date(deadline).getTime() : 0;
                if (deadlineMs > 0 && deadlineMs < now) return;

                activeMatches.push({
                    title: String(opp.title || ""),
                    agency: String(opp.agency || ""),
                    deadline,
                    score: Number(m.score),
                    notice_type: String(opp.notice_type || ""),
                    set_aside_code: String(opp.set_aside_code || ""),
                });
            });

            // Top 5 by score
            const byScore = [...activeMatches].sort((a, b) => b.score - a.score).slice(0, 5);
            setTopOpps(byScore);

            // Next 5 upcoming deadlines
            const byDeadline = activeMatches
                .filter(o => o.deadline)
                .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                .slice(0, 5);
            setUpcomingDeadlines(byDeadline);

            setStats({
                pendingTasks: (tasksRes.data || []).length,
                matchedOpps: allMatches.length,
                pipelineDeals: pipelineRes.count || 0,
                docs: docsRes.count || 0,
            });
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </div>
        );
    }

    const priorityColors: Record<string, string> = {
        urgent: "bg-red-100 text-red-700 border-red-200",
        high: "bg-amber-100 text-amber-700 border-amber-200",
        medium: "bg-blue-100 text-blue-700 border-blue-200",
        low: "bg-stone-100 text-stone-600 border-stone-200",
    };

    const statusIcons: Record<string, React.ReactNode> = {
        waiting_client: <AlertCircle className="w-4 h-4 text-amber-500" />,
        pending: <Clock className="w-4 h-4 text-stone-400" />,
        in_progress: <Loader2 className="w-4 h-4 text-blue-500" />,
        completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    };

    const daysUntil = (deadline: string) => Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);

    const deadlineColor = (deadline: string) => {
        const d = daysUntil(deadline);
        if (d <= 7) return "text-red-600";
        if (d <= 30) return "text-amber-600";
        return "text-emerald-600";
    };

    return (
        <div className="w-full 2xl:w-full 2xl:max-w-[1600px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500">
            {/* Welcome header — matches the self-service dashboard visually */}
            <header>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black">
                    Welcome back, {(profile?.company_name as string) || (profile?.contact_name as string) || "there"}
                </h2>
                <p className="text-stone-500 mt-1 sm:mt-2 font-medium text-sm sm:text-base">
                    Your capture team is on it. Here&apos;s where things stand.
                </p>
            </header>

            {/* KPI cards — same visual language as self-service dashboard */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Link href="/portal/opportunities" className="bg-emerald-50 border border-emerald-200 rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <Briefcase className="w-5 h-5 text-emerald-600" />
                        <ArrowRight className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-3xl sm:text-4xl font-black tracking-tighter text-emerald-700">{stats.matchedOpps}</p>
                    <p className="text-[11px] text-emerald-700/70 mt-1 font-medium uppercase tracking-widest">Matched Opportunities</p>
                </Link>
                <Link href="/portal/pipeline" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 hover:shadow-md hover:border-stone-300 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <Layers className="w-5 h-5 text-stone-500" />
                        <ArrowRight className="w-4 h-4 text-stone-300" />
                    </div>
                    <p className="text-3xl sm:text-4xl font-black tracking-tighter text-stone-900">{stats.pipelineDeals}</p>
                    <p className="text-[11px] text-stone-500 mt-1 font-medium uppercase tracking-widest">Pipeline Deals</p>
                </Link>
                <Link href="/portal/tasks" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 hover:shadow-md hover:border-stone-300 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <ListTodo className="w-5 h-5 text-stone-500" />
                        <ArrowRight className="w-4 h-4 text-stone-300" />
                    </div>
                    <p className="text-3xl sm:text-4xl font-black tracking-tighter text-stone-900">{stats.pendingTasks}</p>
                    <p className="text-[11px] text-stone-500 mt-1 font-medium uppercase tracking-widest">Pending Tasks</p>
                </Link>
                <Link href="/portal/documents" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 hover:shadow-md hover:border-stone-300 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <FileText className="w-5 h-5 text-stone-500" />
                        <ArrowRight className="w-4 h-4 text-stone-300" />
                    </div>
                    <p className="text-3xl sm:text-4xl font-black tracking-tighter text-stone-900">{stats.docs}</p>
                    <p className="text-[11px] text-stone-500 mt-1 font-medium uppercase tracking-widest">Documents</p>
                </Link>
            </section>

            {/* Two-column: Top Opportunities + Upcoming Deadlines */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Opportunities by Score */}
                {topOpps.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                            <h2 className="text-stone-400 text-xs uppercase tracking-widest font-medium">Top Opportunities</h2>
                            <Link href="/portal/opportunities" className="text-xs text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">
                                View all <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                        <div className="divide-y divide-stone-100">
                            {topOpps.map((opp, i) => (
                                <div key={`top-${i}`} className="flex items-center gap-3 px-5 py-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-black flex-shrink-0">
                                        {Math.round(Number(opp.score) * 100)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-stone-800 truncate">{opp.title}</p>
                                        <p className="text-[10px] text-stone-500">{opp.agency}</p>
                                    </div>
                                    {opp.notice_type && (
                                        <span className="text-[10px] text-stone-400 flex-shrink-0">{opp.notice_type}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upcoming Deadlines */}
                {upcomingDeadlines.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                            <h2 className="text-stone-400 text-xs uppercase tracking-widest font-medium">Upcoming Deadlines</h2>
                            <Link href="/portal/opportunities" className="text-xs text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">
                                View all <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                        <div className="divide-y divide-stone-100">
                            {upcomingDeadlines.map((opp, i) => {
                                const days = daysUntil(opp.deadline);
                                return (
                                    <div key={`dl-${i}`} className="flex items-center gap-3 px-5 py-3">
                                        <span className={clsx("text-xs font-black w-10 text-center flex-shrink-0", deadlineColor(opp.deadline))}>
                                            {days}d
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-stone-800 truncate">{opp.title}</p>
                                            <p className="text-[10px] text-stone-500">{opp.agency}</p>
                                        </div>
                                        <span className="text-[10px] text-stone-400 flex-shrink-0">
                                            {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Recent Tasks */}
            {tasks.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                        <h2 className="text-stone-400 text-xs uppercase tracking-widest font-medium">Recent Tasks</h2>
                        <Link href="/portal/tasks" className="text-xs text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">
                            View all <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-stone-100">
                        {tasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                                {statusIcons[task.status] || <Clock className="w-4 h-4 text-stone-400" />}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-stone-800 truncate">{task.title}</p>
                                    {task.due_date && (
                                        <p className="text-xs text-stone-400">
                                            Due: {new Date(task.due_date).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", priorityColors[task.priority] || priorityColors.medium)}>
                                    {task.priority}
                                </span>
                                {task.status === "waiting_client" && (
                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                                        Needs Your Action
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {tasks.length === 0 && topOpps.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">
                        Your portal is being set up. We&apos;ll notify you when there are opportunities or tasks.
                    </p>
                </div>
            )}
        </div>
    );
}
