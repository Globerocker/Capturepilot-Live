"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    due_date: string | null;
    category: string | null;
    completed_at: string | null;
    created_at: string;
}

export default function PortalTasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"active" | "completed">("active");

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (!prof) return;

            const { data } = await supabase
                .from("client_tasks")
                .select("*")
                .eq("user_profile_id", prof.id)
                .order("created_at", { ascending: false });

            setTasks((data || []) as Task[]);
            setLoading(false);
        })();
    }, []);

    const handleComplete = async (taskId: string) => {
        await supabase.from("client_tasks").update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq("id", taskId);

        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "completed", completed_at: new Date().toISOString() } : t));
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>;
    }

    const filtered = tasks.filter(t =>
        filter === "active" ? t.status !== "completed" && t.status !== "cancelled" : t.status === "completed"
    );

    const priorityColors: Record<string, string> = {
        urgent: "bg-red-100 text-red-700 border-red-200",
        high: "bg-amber-100 text-amber-700 border-amber-200",
        medium: "bg-blue-100 text-blue-700 border-blue-200",
        low: "bg-stone-100 text-stone-600 border-stone-200",
    };

    const categoryLabels: Record<string, string> = {
        onboarding: "Onboarding",
        document: "Document",
        registration: "Registration",
        website: "Website",
        proposal: "Proposal",
        opportunity: "Opportunity",
        compliance: "Compliance",
        general: "General",
        email_setup: "Email Setup",
        sam_registration: "SAM.gov",
    };

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-black font-typewriter">Tasks</h1>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setFilter("active")} className={clsx("text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors", filter === "active" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50")}>
                        Active ({tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length})
                    </button>
                    <button type="button" onClick={() => setFilter("completed")} className={clsx("text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors", filter === "completed" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50")}>
                        Completed ({tasks.filter(t => t.status === "completed").length})
                    </button>
                </div>
            </div>

            {filtered.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">
                        {filter === "active" ? "No active tasks. You're all caught up!" : "No completed tasks yet."}
                    </p>
                </div>
            )}

            <div className="space-y-3">
                {filtered.map(task => (
                    <div key={task.id} className={clsx("bg-white border rounded-2xl p-5 transition-all", task.status === "waiting_client" ? "border-amber-200 bg-amber-50/30" : "border-stone-200")}>
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                                {task.status === "completed" ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                                 task.status === "waiting_client" ? <AlertCircle className="w-5 h-5 text-amber-500" /> :
                                 <Clock className="w-5 h-5 text-stone-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className={clsx("font-bold text-sm", task.status === "completed" ? "text-stone-400 line-through" : "text-black")}>
                                        {task.title}
                                    </h3>
                                    <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", priorityColors[task.priority] || priorityColors.medium)}>
                                        {task.priority}
                                    </span>
                                    {task.category && (
                                        <span className="text-[10px] font-typewriter bg-stone-100 text-stone-500 border border-stone-200 px-2 py-0.5 rounded">
                                            {categoryLabels[task.category] || task.category}
                                        </span>
                                    )}
                                    {task.status === "waiting_client" && (
                                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                                            Needs Your Action
                                        </span>
                                    )}
                                </div>
                                {task.description && (
                                    <p className="text-sm text-stone-600 mt-2 leading-relaxed">{task.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-3">
                                    {task.due_date && (
                                        <p className="text-xs text-stone-400">
                                            Due: {new Date(task.due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                        </p>
                                    )}
                                    {task.status !== "completed" && (
                                        <button
                                            type="button"
                                            onClick={() => handleComplete(task.id)}
                                            className="text-xs font-bold text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
