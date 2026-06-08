"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Plug, RefreshCw, ArrowLeft, CheckCircle2, AlertTriangle, MinusCircle, HelpCircle,
    Clock, Key, ExternalLink, Bell,
} from "lucide-react";
import clsx from "clsx";
import { StatusBadge, type StatusTone } from "@/components/admin/health/StatusBadge";
import { ActionButton } from "@/components/admin/health/ActionButton";

interface Integration {
    slug: string;
    label: string;
    env_var_name: string;
    configured: boolean;
    last_status: string | null;
    last_check_at: string | null;
    last_detail: string | null;
    days_until_expiry: number | null;
    rotation_warn: boolean;
    rotation_days: number | null;
    expires_at: string | null;
    docs_url: string | null;
    rotate_url: string | null;
    has_probe: boolean;
    consecutive_fails: number;
    last_success_at: string | null;
    last_success_source: string | null;
    open_alert_count: number;
}

function fmtRelative(ts: string | null): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Map the connector's stored status string onto the shared StatusBadge tone
// vocabulary. Connectors carry "ok | error | disabled | unknown | null"; the
// shared badge speaks "ok | warn | error | unknown | public | private".
function toneFor(integ: Integration): { tone: StatusTone; label: string } {
    if (!integ.configured) return { tone: "unknown", label: "Not configured" };
    if (integ.last_status === "ok") return { tone: "ok", label: "Healthy" };
    if (integ.last_status === "error") return { tone: "error", label: "Failing" };
    if (integ.last_status === "disabled") return { tone: "unknown", label: "Disabled" };
    return { tone: "warn", label: "Unprobed" };
}

export default function IntegrationsHealthPage() {
    const [rows, setRows] = useState<Integration[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/health/integrations", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setRows(data.integrations);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    const total = rows?.length ?? 0;
    const healthy = rows?.filter(r => r.configured && r.last_status === "ok").length ?? 0;
    const failing = rows?.filter(r => r.configured && r.last_status === "error").length ?? 0;
    const unconfigured = rows?.filter(r => !r.configured).length ?? 0;
    const rotationDue = rows?.filter(r => r.rotation_warn).length ?? 0;

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6 pb-12">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/admin/health" className="text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1 mb-2">
                        <ArrowLeft className="w-3 h-3" /> Back to Env Health
                    </Link>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Operations · Health</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Plug className="w-6 h-6" /> Integrations
                    </h1>
                    <p className="text-sm text-stone-500 mt-1 max-w-2xl">
                        Every external service we call from Vercel. Each row is the cached state from the hourly health monitor — click in for a live "Test connection" probe, the most recent sample payload, and the rotation countdown.
                    </p>
                </div>
                <ActionButton onClick={load} loading={loading} icon={RefreshCw}>Refresh</ActionButton>
            </header>

            {/* KPI strip */}
            {rows && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black text-emerald-600">{healthy}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Healthy</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <AlertTriangle className="w-4 h-4 text-rose-500 mb-1" />
                        <p className="text-2xl font-black text-rose-600">{failing}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Failing</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <MinusCircle className="w-4 h-4 text-stone-400 mb-1" />
                        <p className="text-2xl font-black text-stone-500">{unconfigured}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Not Configured</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Clock className="w-4 h-4 text-amber-500 mb-1" />
                        <p className="text-2xl font-black text-amber-600">{rotationDue}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Rotation Due</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Plug className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black text-blue-600">{total}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Services</p>
                    </div>
                </div>
            )}

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4">{err}</div>
            )}

            {/* List of integrations as rounded-[28px] cards */}
            <section className="space-y-3">
                {(rows || []).map((integ) => {
                    const { tone, label } = toneFor(integ);
                    const expiryColor =
                        integ.days_until_expiry === null ? "text-stone-400" :
                        integ.days_until_expiry <= 0 ? "text-rose-700 font-bold" :
                        integ.days_until_expiry <= 3 ? "text-rose-700 font-bold" :
                        integ.days_until_expiry <= 14 ? "text-amber-700 font-bold" :
                        "text-stone-500";
                    return (
                        <Link
                            key={integ.slug}
                            href={`/admin/health/integrations/${integ.slug}`}
                            className="block bg-white border border-stone-200 rounded-[28px] p-5 hover:border-emerald-300 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-start gap-4 flex-wrap">
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-bold text-stone-900">{integ.label}</h3>
                                        <StatusBadge tone={tone} label={label} />
                                        {integ.open_alert_count > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                <Bell className="w-3 h-3" /> {integ.open_alert_count} open
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone-500">
                                        <code className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-600">{integ.env_var_name}</code>
                                        {integ.configured ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-700">
                                                <CheckCircle2 className="w-3 h-3" /> env set
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-stone-500">
                                                <MinusCircle className="w-3 h-3" /> env unset
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            checked {fmtRelative(integ.last_check_at)}
                                        </span>
                                        {integ.last_success_at && (
                                            <span className="inline-flex items-center gap-1" title={integ.last_success_source || ""}>
                                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                last call {fmtRelative(integ.last_success_at)}
                                            </span>
                                        )}
                                        {integ.consecutive_fails > 0 && (
                                            <span className="inline-flex items-center gap-1 text-rose-700">
                                                <AlertTriangle className="w-3 h-3" /> {integ.consecutive_fails} consecutive fails
                                            </span>
                                        )}
                                    </div>
                                    {integ.last_detail && (
                                        <p className="text-[11px] text-stone-500 italic">{integ.last_detail}</p>
                                    )}
                                </div>

                                <div className="text-right space-y-1.5 min-w-[140px]">
                                    <div className="flex items-center gap-1 justify-end text-[10px] text-stone-400 uppercase tracking-wider">
                                        <Key className="w-3 h-3" /> Rotation
                                    </div>
                                    <p className={clsx("text-sm tabular-nums", expiryColor)}>
                                        {integ.days_until_expiry === null
                                            ? "no expiry"
                                            : integ.days_until_expiry <= 0
                                            ? `expired ${Math.abs(integ.days_until_expiry)}d ago`
                                            : `${integ.days_until_expiry}d left`}
                                    </p>
                                    {integ.rotation_days && (
                                        <p className="text-[10px] text-stone-400">every {integ.rotation_days}d</p>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
                {loading && !rows && (
                    <div className="flex items-center justify-center py-12 text-stone-400 text-sm">
                        <HelpCircle className="w-4 h-4 mr-2" /> Loading integrations…
                    </div>
                )}
            </section>

            {/* Footer hint */}
            {rows && (
                <div className="text-[11px] text-stone-400 flex items-center gap-2">
                    <ExternalLink className="w-3 h-3" />
                    The hourly /api/cron/health_monitor refreshes every row. Click in to run a fresh probe on demand.
                </div>
            )}
        </div>
    );
}
