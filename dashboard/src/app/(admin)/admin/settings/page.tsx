"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Settings, Database, Globe, Key, Server, Loader2, CheckCircle2,
    AlertTriangle, HelpCircle, ExternalLink, RefreshCw,
} from "lucide-react";
import clsx from "clsx";

interface ServiceStatus {
    key: string;
    env_var: string;
    configured: boolean;
    reachable: "unknown" | "ok" | "error";
    detail?: string;
}

export default function AdminSettings() {
    const [checks, setChecks] = useState<ServiceStatus[] | null>(null);
    const [loadingChecks, setLoadingChecks] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function loadChecks() {
        setLoadingChecks(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/env-health", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setChecks(data.checks);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoadingChecks(false);
        }
    }

    useEffect(() => { loadChecks(); }, []);

    return (
        <div className="w-full space-y-6">
            <h1 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5" /> System Settings
            </h1>

            {/* URLs */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">URLs & Domains</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">App</span><span className="font-mono text-stone-700">app.capturepilot.com</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Admin</span><span className="font-mono text-stone-700">admin.capturepilot.com</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Quick Check</span><span className="font-mono text-stone-700">app.capturepilot.com/check</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Client Portal</span><span className="font-mono text-stone-700">app.capturepilot.com/portal</span></div>
                    <div className="flex justify-between py-1.5"><span className="text-stone-500">Vercel</span><a href="https://vercel.com/celluiq/capturepilot-v3" target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">vercel.com/celluiq/capturepilot-v3</a></div>
                </div>
            </div>

            {/* Database */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Database (Supabase)</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Dashboard</span><a href="https://supabase.com/dashboard/project/ryxgjzehoijjvczqkhwr" target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">supabase.com/dashboard</a></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Plan</span><span className="text-stone-700">Pro</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Region</span><span className="text-stone-700">US East (IAD)</span></div>
                    <div className="flex justify-between py-1.5"><span className="text-stone-500">Storage Buckets</span><span className="text-stone-700">client-docs, opportunity-attachments</span></div>
                </div>
            </div>

            {/* API Keys — live status via /api/admin/env-health */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm">API Keys (live status)</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={loadChecks}
                            disabled={loadingChecks}
                            className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 disabled:opacity-50"
                        >
                            {loadingChecks ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Refresh
                        </button>
                        <Link href="/admin/health" className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                            Full env health <ExternalLink className="w-3 h-3" />
                        </Link>
                    </div>
                </div>
                <div className="p-5 space-y-1.5 text-sm">
                    {err && <p className="text-xs text-rose-600">Failed to load: {err}</p>}
                    {!checks && !err && loadingChecks && (
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Probing services…
                        </div>
                    )}
                    {checks && checks.map(c => {
                        const Icon =
                            !c.configured ? HelpCircle :
                            c.reachable === "ok" ? CheckCircle2 :
                            c.reachable === "error" ? AlertTriangle :
                            HelpCircle;
                        const iconCls =
                            !c.configured ? "text-stone-400" :
                            c.reachable === "ok" ? "text-emerald-600" :
                            c.reachable === "error" ? "text-rose-600" :
                            "text-amber-500";
                        const label =
                            !c.configured ? "Not configured" :
                            c.reachable === "ok" ? "Configured · Reachable" :
                            c.reachable === "error" ? "Configured · Unreachable" :
                            "Configured · Not probed";
                        const labelCls =
                            !c.configured ? "text-stone-400" :
                            c.reachable === "ok" ? "text-emerald-700" :
                            c.reachable === "error" ? "text-rose-700" :
                            "text-amber-700";
                        return (
                            <div key={c.env_var} className="flex justify-between items-center py-1.5 border-b border-stone-50 last:border-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Icon className={clsx("w-3.5 h-3.5 flex-shrink-0", iconCls)} />
                                    <code className="font-mono text-stone-600 text-xs truncate">{c.env_var}</code>
                                </div>
                                <span className={clsx("text-xs font-bold flex-shrink-0", labelCls)}>{label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Infrastructure */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Infrastructure</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Framework</span><span className="text-stone-700">Next.js 16.1.6 (Turbopack)</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Node.js</span><span className="text-stone-700">20.x LTS</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Hosting</span><span className="text-stone-700">Vercel (Pro)</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Email</span><span className="text-stone-700">Resend</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">AI</span><span className="text-stone-700">OpenAI (GPT-4o-mini) + Gemini Flash</span></div>
                    <div className="flex justify-between py-1.5"><span className="text-stone-500">Enrichment</span><span className="text-stone-700">Apollo.io + USASpending + SAM.gov</span></div>
                </div>
            </div>
        </div>
    );
}
