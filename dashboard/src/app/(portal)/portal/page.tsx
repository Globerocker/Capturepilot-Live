// @ts-nocheck — Supabase join types cause unknown ReactNode errors in React 19 strict mode
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ListTodo, Briefcase, FileText, Users, AlertCircle,
    CheckCircle2, Clock, Loader2, ArrowRight, Shield, TrendingUp,
} from "lucide-react";
import clsx from "clsx";
import { MarketIntelligence } from "@/components/MarketIntelligence";

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

interface ActivityItem {
    id: string;
    action: string;
    description: string;
    created_at: string;
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
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [stats, setStats] = useState({ pendingTasks: 0, activeOpps: 0, docs: 0, competitors: 0, totalMatches: 0 });
    const [urgencyOpps, setUrgencyOpps] = useState<OppMatch[]>([]);

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

            // Fetch tasks, activity, stats in parallel
            const [tasksRes, activityRes, matchesRes, docsRes, compRes] = await Promise.all([
                supabase.from("client_tasks").select("*").eq("user_profile_id", prof.id).neq("status", "completed").order("created_at", { ascending: false }).limit(5),
                supabase.from("client_activity_log").select("*").eq("user_profile_id", prof.id).order("created_at", { ascending: false }).limit(10),
                supabase.from("user_matches").select("score, opportunity:opportunities!inner(title, agency, response_deadline, notice_type, set_aside_code, status)").eq("user_profile_id", prof.id),
                supabase.from("client_documents").select("id", { count: "exact", head: true }).eq("user_profile_id", prof.id),
                supabase.from("client_competitors").select("id", { count: "exact", head: true }).eq("user_profile_id", prof.id),
            ]);

            setTasks((tasksRes.data || []) as Task[]);
            setActivity((activityRes.data || []) as ActivityItem[]);

            // Process all matches for urgency and counts
            const allMatches = (matchesRes.data || []) as Array<Record<string, unknown>>;
            const now = Date.now();

            // Filter to active only and build urgency list
            const activeMatches: OppMatch[] = [];
            allMatches.forEach((m) => {
                const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Record<string, unknown>;
                if (!opp) return;
                const status = String(opp.status || "");
                if (status === "EXPIRED" || status === "AWARDED" || status === "ARCHIVED") return;

                const deadline = String(opp.response_deadline || "");
                const deadlineMs = deadline ? new Date(deadline).getTime() : 0;
                if (deadlineMs > 0 && deadlineMs < now) return; // already expired by date

                activeMatches.push({
                    title: String(opp.title || ""),
                    agency: String(opp.agency || ""),
                    deadline,
                    score: Number(m.score),
                    notice_type: String(opp.notice_type || ""),
                    set_aside_code: String(opp.set_aside_code || ""),
                });
            });

            // Sort by deadline urgency (soonest first)
            const withDeadlines = activeMatches
                .filter(o => o.deadline)
                .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                .slice(0, 10);

            setUrgencyOpps(withDeadlines);

            setStats({
                pendingTasks: (tasksRes.data || []).length,
                activeOpps: activeMatches.length,
                totalMatches: allMatches.length,
                docs: docsRes.count || 0,
                competitors: compRes.count || 0,
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

    const getUrgencyInfo = (deadline: string) => {
        const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
        if (daysLeft <= 7) return { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Urgent", dotColor: "bg-red-500" };
        if (daysLeft <= 30) return { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: "Soon", dotColor: "bg-amber-500" };
        return { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", label: "On Track", dotColor: "bg-emerald-500" };
    };

    // Group urgency opps
    const urgentOpps = urgencyOpps.filter(o => { const d = Math.ceil((new Date(o.deadline).getTime() - Date.now()) / 86400000); return d <= 7; });
    const soonOpps = urgencyOpps.filter(o => { const d = Math.ceil((new Date(o.deadline).getTime() - Date.now()) / 86400000); return d > 7 && d <= 30; });
    const onTrackOpps = urgencyOpps.filter(o => { const d = Math.ceil((new Date(o.deadline).getTime() - Date.now()) / 86400000); return d > 30; });

    return (
        <div className="max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter">
                    Welcome, {(profile?.contact_name as string) || (profile?.company_name as string)}
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Here&apos;s what&apos;s happening with your government contracting pipeline.
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Link href="/portal/tasks" className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors">
                    <ListTodo className="w-5 h-5 text-amber-500 mb-2" />
                    <p className="text-2xl font-black">{stats.pendingTasks}</p>
                    <p className="text-xs text-stone-500">Pending Tasks</p>
                </Link>
                <Link href="/portal/opportunities" className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors">
                    <Briefcase className="w-5 h-5 text-blue-500 mb-2" />
                    <p className="text-2xl font-black">{stats.activeOpps}</p>
                    <p className="text-xs text-stone-500">Active Opportunities</p>
                </Link>
                <Link href="/portal/documents" className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors">
                    <FileText className="w-5 h-5 text-emerald-500 mb-2" />
                    <p className="text-2xl font-black">{stats.docs}</p>
                    <p className="text-xs text-stone-500">Documents</p>
                </Link>
                <Link href="/portal/competitors" className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors">
                    <Users className="w-5 h-5 text-violet-500 mb-2" />
                    <p className="text-2xl font-black">{stats.competitors}</p>
                    <p className="text-xs text-stone-500">Competitors</p>
                </Link>
            </div>

            {/* Tasks requiring action — shown first */}
            {tasks.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                        <h2 className="font-bold text-sm">Your Tasks</h2>
                        <Link href="/portal/tasks" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
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

            {/* Opportunity Timeline */}
            {urgencyOpps.length >= 1 ? (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                        <h2 className="font-bold text-sm">Opportunity Timeline</h2>
                        <Link href="/portal/opportunities" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            View all <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>

                    {/* On Track (green) */}
                    {Boolean(onTrackOpps.length > 0) && (
                        <div>
                            <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-bold text-emerald-700 uppercase">On Track ({onTrackOpps.length})</span>
                            </div>
                            <div className="divide-y divide-stone-50">
                                {onTrackOpps.map((opp, i) => {
                                    const daysLeft = Math.ceil((new Date(opp.deadline).getTime() - Date.now()) / 86400000);
                                    return (
                                        <div key={`g-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                                            <span className="text-xs font-black w-10 text-center text-emerald-600">{daysLeft}d</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-stone-800 truncate">{opp.title}</p>
                                                <p className="text-[10px] text-stone-500">{opp.agency}</p>
                                            </div>
                                            <span className="text-[10px] text-stone-400">
                                                {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Approaching (yellow) */}
                    {Boolean(soonOpps.length > 0) && (
                        <div>
                            <div className="px-5 py-2 bg-amber-50 border-b border-t border-amber-100 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-[10px] font-bold text-amber-700 uppercase">Approaching ({soonOpps.length})</span>
                            </div>
                            <div className="divide-y divide-stone-50">
                                {soonOpps.map((opp, i) => {
                                    const daysLeft = Math.ceil((new Date(opp.deadline).getTime() - Date.now()) / 86400000);
                                    return (
                                        <div key={`y-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                                            <span className="text-xs font-black w-10 text-center text-amber-600">{daysLeft}d</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-stone-800 truncate">{opp.title}</p>
                                                <p className="text-[10px] text-stone-500">{opp.agency}</p>
                                            </div>
                                            <span className="text-[10px] text-stone-400">
                                                {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Urgent (red) */}
                    {Boolean(urgentOpps.length > 0) && (
                        <div>
                            <div className="px-5 py-2 bg-red-50 border-b border-t border-red-100 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-[10px] font-bold text-red-700 uppercase">Urgent ({urgentOpps.length})</span>
                            </div>
                            <div className="divide-y divide-stone-50">
                                {urgentOpps.map((opp, i) => {
                                    const daysLeft = Math.ceil((new Date(opp.deadline).getTime() - Date.now()) / 86400000);
                                    return (
                                        <div key={`r-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                                            <span className="text-xs font-black w-10 text-center text-red-600">{daysLeft}d</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-red-900 truncate">{opp.title}</p>
                                                <p className="text-[10px] text-red-600">{opp.agency}</p>
                                            </div>
                                            <span className="text-[10px] font-bold text-red-500">
                                                {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Activity Feed */}
            {activity.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-100">
                        <h2 className="font-bold text-sm">Recent Activity</h2>
                    </div>
                    <div className="divide-y divide-stone-50 max-h-64 overflow-y-auto">
                        {activity.map((item) => (
                            <div key={item.id} className="flex items-start gap-3 px-5 py-3">
                                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm text-stone-700">{item.description}</p>
                                    <p className="text-xs text-stone-400 mt-0.5">
                                        {new Date(item.created_at).toLocaleDateString("en-US", {
                                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tasks.length === 0 && activity.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">
                        Your portal is being set up. We&apos;ll notify you when there are tasks or updates.
                    </p>
                </div>
            )}
            {/* Market Intelligence */}
            {profile?.naics_codes && (profile.naics_codes as string[]).length > 0 && (
                <MarketIntelligence
                    naicsCodes={profile.naics_codes as string[]}
                    companyName={profile.company_name as string}
                />
            )}
        </div>
    );
}
