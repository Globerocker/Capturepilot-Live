"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw } from "lucide-react";
import clsx from "clsx";

interface ServiceStatus {
    key: string;
    env_var: string;
    configured: boolean;
    reachable: "unknown" | "ok" | "error";
    detail?: string;
    last_check: string;
}

export default function EnvHealthPage() {
    const [checks, setChecks] = useState<ServiceStatus[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/env-health", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setChecks(data.checks);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    return (
        <div className="max-w-3xl mx-auto">
            <header className="mb-8 flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Env Health</h1>
                    <p className="text-sm text-stone-400">
                        Live reachability checks against every third-party API we call. No secret values are returned.
                        Refresh any time; each probe uses a 6-second timeout.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-300 text-xs font-bold hover:bg-stone-800 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Refresh
                </button>
            </header>

            {err && (
                <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm rounded-xl p-4 mb-4">
                    {err}
                </div>
            )}

            <div className="space-y-2">
                {(checks || []).map((c) => {
                    const stateColor =
                        !c.configured ? "bg-stone-900 border-stone-800" :
                        c.reachable === "ok" ? "bg-emerald-500/5 border-emerald-500/30" :
                        c.reachable === "error" ? "bg-rose-500/5 border-rose-500/40" :
                        "bg-amber-500/5 border-amber-500/30";

                    const Icon =
                        !c.configured ? HelpCircle :
                        c.reachable === "ok" ? CheckCircle2 :
                        c.reachable === "error" ? AlertTriangle :
                        HelpCircle;

                    const iconColor =
                        !c.configured ? "text-stone-500" :
                        c.reachable === "ok" ? "text-emerald-500" :
                        c.reachable === "error" ? "text-rose-500" :
                        "text-amber-500";

                    const label =
                        !c.configured ? "Not configured" :
                        c.reachable === "ok" ? "Reachable" :
                        c.reachable === "error" ? "Unreachable or unauthorized" :
                        "Not probed";

                    return (
                        <div key={c.env_var} className={clsx("p-4 rounded-xl border flex items-start gap-3", stateColor)}>
                            <Icon className={clsx("w-5 h-5 flex-shrink-0 mt-0.5", iconColor)} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-bold text-sm text-white">{c.key}</p>
                                    <code className="text-[10px] bg-stone-950 px-1.5 py-0.5 rounded border border-stone-800 text-stone-400">{c.env_var}</code>
                                </div>
                                <p className="text-xs text-stone-400 mt-0.5">{label}</p>
                                {c.detail && <p className="text-[10px] text-stone-500 mt-0.5">{c.detail}</p>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {loading && !checks && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
                </div>
            )}
        </div>
    );
}
