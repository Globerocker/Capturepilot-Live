"use client";

import { useEffect, useState } from "react";
import { Sparkles, Zap, Target, FileText, Play, CheckCircle2, Loader2 } from "lucide-react";
import clsx from "clsx";
import LiveJobProgress, { type Job } from "@/components/jobs/LiveJobProgress";
import { createSupabaseClient } from "@/lib/supabase/client";

interface FillStats {
    total: number;
    has_real_desc: number;
    still_url_desc: number;
    has_reqs: number;
    has_win_strategy: number;
    has_resource_links: number;
    has_attachment_urls: number;
    touched_7d: number;
}

const PRESETS = [
    {
        id: "hot_warm",
        label: "HOT + WARM matches only",
        icon: Target,
        description: "Prioritize opportunities that actually match a user. Fastest value, keeps $ cost small.",
        limit: 100,
        color: "emerald",
    },
    {
        id: "needs_ai",
        label: "All opps missing AI Win Strategy",
        icon: Sparkles,
        description: "Sweeps `ai_win_strategy IS NULL`. Broad. Fills the biggest visible gap. Costs $$ (OpenAI).",
        limit: 200,
        color: "amber",
    },
    {
        id: "needs_desc",
        label: "All opps still showing SAM URL as description",
        icon: FileText,
        description: "Fetches the real solicitation text from SAM.gov. Free. Prerequisite for good AI output.",
        limit: 200,
        color: "blue",
    },
    {
        id: "all_active",
        label: "All active opportunities (recent-first)",
        icon: Zap,
        description: "Full sweep by posted_date desc. Handles description fetch + scoring + AI. Most expensive.",
        limit: 100,
        color: "stone",
    },
];

export default function BulkEnrichPage() {
    const [stats, setStats] = useState<FillStats | null>(null);
    const [scope, setScope] = useState<string>("hot_warm");
    const [limit, setLimit] = useState<number>(100);
    const [flagDesc, setFlagDesc] = useState(true);
    const [flagReqs, setFlagReqs] = useState(true);
    const [flagScoring, setFlagScoring] = useState(true);
    const [flagAi, setFlagAi] = useState(true);
    const [concurrency, setConcurrency] = useState(4);
    const [jobId, setJobId] = useState<string | null>(null);
    const [recentJobs, setRecentJobs] = useState<Array<{ id: string; title: string | null; status: string; progress_pct: number; created_at: string }>>([]);
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);

    // Pull fill stats + recent bulk jobs
    async function refresh() {
        const sb = createSupabaseClient();
        // Fill stats via direct RPC-like query (service key not available client-side,
        // so we rely on the RLS-open status). Do a cheap count via `head: true`.
        const [{ count: total }, { count: hasWin }, { count: hasReqs }, { count: hasResource }, { count: hasAttach }, { count: urlDesc }] = await Promise.all([
            sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false),
            sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false).not("ai_win_strategy", "is", null),
            sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false).not("structured_requirements", "eq", "{}"),
            sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false).not("resource_links", "is", null),
            sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false).not("attachment_urls", "is", null),
            sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false).like("description", "https://api.sam.gov%"),
        ]);
        setStats({
            total: total || 0,
            has_real_desc: (total || 0) - (urlDesc || 0),
            still_url_desc: urlDesc || 0,
            has_reqs: hasReqs || 0,
            has_win_strategy: hasWin || 0,
            has_resource_links: hasResource || 0,
            has_attachment_urls: hasAttach || 0,
            touched_7d: 0,
        });

        // Recent bulk jobs list
        const recentRes = await fetch("/api/jobs?kind=bulk_enrich");
        if (recentRes.ok) {
            const data = await recentRes.json();
            setRecentJobs(data.jobs || []);
        }
    }

    useEffect(() => { refresh(); }, []);

    // Sync limit with preset
    useEffect(() => {
        const p = PRESETS.find(pr => pr.id === scope);
        if (p) setLimit(p.limit);
    }, [scope]);

    async function startBulk() {
        if (starting) return;
        setStarting(true);
        setError(null);
        setJobId(null);
        try {
            const res = await fetch("/api/admin/bulk-enrich", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scope,
                    limit,
                    do_description: flagDesc,
                    do_requirements: flagReqs,
                    do_scoring: flagScoring,
                    do_ai_strategy: flagAi,
                    concurrency,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.jobId) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            setJobId(data.jobId);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(false);
        }
    }

    const handleComplete = (_job: Job) => {
        setTimeout(() => { refresh(); setJobId(null); }, 1500);
    };

    const pct = (n: number) => stats && stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;

    return (
        <div className="max-w-5xl mx-auto pb-16">
            <header className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Bulk Enrichment</h1>
                <p className="text-sm text-stone-400">
                    Fill gaps in opportunity data across many rows at once. Every run creates one tracked background job
                    — watch the live progress below, or navigate away and return later.
                </p>
            </header>

            {/* Fill stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                    {[
                        { label: "Active opps", value: stats.total.toLocaleString(), sub: null, color: "stone" },
                        { label: "Real description", value: pct(stats.has_real_desc) + "%", sub: `${stats.has_real_desc.toLocaleString()} / ${stats.total.toLocaleString()}`, color: "blue" },
                        { label: "Structured reqs", value: pct(stats.has_reqs) + "%", sub: `${stats.has_reqs.toLocaleString()} rows`, color: "purple" },
                        { label: "AI Win Strategy", value: pct(stats.has_win_strategy) + "%", sub: `${stats.has_win_strategy.toLocaleString()} rows`, color: "emerald" },
                        { label: "Have resource_links", value: pct(stats.has_resource_links) + "%", sub: `${stats.has_resource_links.toLocaleString()} rows`, color: "amber" },
                        { label: "Cached attachments", value: pct(stats.has_attachment_urls) + "%", sub: `${stats.has_attachment_urls.toLocaleString()} rows`, color: "rose" },
                        { label: "Still URL desc", value: stats.still_url_desc.toLocaleString(), sub: "need description fetch", color: "amber" },
                    ].map((s) => (
                        <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{s.label}</p>
                            <p className="text-2xl font-bold text-white mt-1 tabular-nums">{s.value}</p>
                            {s.sub && <p className="text-[10px] text-stone-500 mt-0.5">{s.sub}</p>}
                        </div>
                    ))}
                </div>
            )}

            {/* Preset cards */}
            <div className="mb-6">
                <h2 className="text-sm font-bold text-stone-300 uppercase tracking-wider mb-3">1. Pick a scope</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PRESETS.map((p) => {
                        const Icon = p.icon;
                        const active = scope === p.id;
                        return (
                            <button
                                type="button"
                                key={p.id}
                                onClick={() => setScope(p.id)}
                                className={clsx(
                                    "text-left p-4 rounded-2xl border transition-colors",
                                    active
                                        ? "bg-emerald-500/10 border-emerald-500/40"
                                        : "bg-stone-900 border-stone-800 hover:border-stone-700",
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <Icon className={clsx("w-5 h-5 flex-shrink-0 mt-0.5", active ? "text-emerald-400" : "text-stone-500")} />
                                    <div className="min-w-0">
                                        <p className={clsx("font-bold text-sm", active ? "text-emerald-300" : "text-white")}>{p.label}</p>
                                        <p className="text-xs text-stone-500 mt-1 leading-relaxed">{p.description}</p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Knobs */}
            <div className="mb-6 bg-stone-900 border border-stone-800 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-stone-300 uppercase tracking-wider mb-4">2. Tune the run</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <label className="text-xs">
                        <span className="text-stone-400 font-semibold">Batch size</span>
                        <input
                            type="number"
                            value={limit}
                            onChange={(e) => setLimit(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 500))}
                            min={1}
                            max={500}
                            className="mt-1 w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        <span className="text-[10px] text-stone-600 mt-0.5 block">max 500 per job · 300s budget</span>
                    </label>
                    <label className="text-xs">
                        <span className="text-stone-400 font-semibold">Concurrency</span>
                        <input
                            type="number"
                            value={concurrency}
                            onChange={(e) => setConcurrency(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 8))}
                            min={1}
                            max={8}
                            className="mt-1 w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        <span className="text-[10px] text-stone-600 mt-0.5 block">parallel workers · 1-8</span>
                    </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                        { flag: flagDesc, setter: setFlagDesc, label: "Fetch description", cost: "free" },
                        { flag: flagReqs, setter: setFlagReqs, label: "Extract requirements", cost: "free" },
                        { flag: flagScoring, setter: setFlagScoring, label: "Strategic scoring", cost: "free" },
                        { flag: flagAi, setter: setFlagAi, label: "AI win strategy", cost: "OpenAI $" },
                    ].map((t) => (
                        <button
                            type="button"
                            key={t.label}
                            onClick={() => t.setter(!t.flag)}
                            className={clsx(
                                "px-3 py-2 rounded-xl border text-xs font-semibold text-left transition-colors",
                                t.flag ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "bg-stone-950 border-stone-800 text-stone-500",
                            )}
                        >
                            {t.flag ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : null}
                            {t.label}
                            <span className={clsx("block text-[9px] mt-0.5", t.flag ? "text-emerald-400/70" : "text-stone-600")}>{t.cost}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Fire */}
            {!jobId && (
                <div className="mb-6 flex flex-wrap gap-3 items-center">
                    <button
                        type="button"
                        onClick={startBulk}
                        disabled={starting || (!flagDesc && !flagReqs && !flagScoring && !flagAi)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {starting ? "Starting…" : "Start bulk enrichment"}
                    </button>
                    {error && <p className="text-xs text-rose-400">{error}</p>}
                </div>
            )}

            {/* Live progress */}
            {jobId && (
                <div className="mb-6">
                    <LiveJobProgress jobId={jobId} onComplete={handleComplete} onFail={() => setJobId(null)} />
                </div>
            )}

            {/* History */}
            {recentJobs.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-stone-300 uppercase tracking-wider mb-3">Recent runs</h2>
                    <div className="space-y-2">
                        {recentJobs.slice(0, 6).map(j => (
                            <button
                                type="button"
                                key={j.id}
                                onClick={() => setJobId(j.id)}
                                className="w-full text-left p-3 bg-stone-900 border border-stone-800 rounded-xl hover:border-stone-700 flex items-center gap-3"
                            >
                                <div className={clsx(
                                    "w-2 h-2 rounded-full",
                                    j.status === "running" ? "bg-emerald-400 animate-pulse" :
                                    j.status === "completed" ? "bg-emerald-600" :
                                    j.status === "failed" ? "bg-rose-600" : "bg-stone-600",
                                )} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{j.title || "Bulk enrich"}</p>
                                    <p className="text-[10px] text-stone-500">
                                        {j.status} · {j.progress_pct}% · {new Date(j.created_at).toLocaleString()}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
