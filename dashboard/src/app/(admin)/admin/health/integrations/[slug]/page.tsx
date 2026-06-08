"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    Plug, ArrowLeft, Clock, Key, ExternalLink, Bell,
    Zap, FileJson, CheckCircle2, AlertTriangle, RefreshCw, Eye,
} from "lucide-react";
import clsx from "clsx";
import { StatusBadge, type StatusTone } from "@/components/admin/health/StatusBadge";
import { ActionButton } from "@/components/admin/health/ActionButton";
import { DataTable } from "@/components/admin/health/DataTable";
import { SampleDrawer } from "@/components/admin/health/SampleDrawer";

interface Connector {
    slug: string;
    label: string;
    env_var_name: string;
    category: string;
    enabled: boolean;
    rotation_days: number | null;
    expires_at: string | null;
    docs_url: string | null;
    rotate_url: string | null;
    notes: string | null;
    last_check_at: string | null;
    last_status: string | null;
    last_detail: string | null;
    consecutive_fails: number;
    configured: boolean;
    days_until_expiry: number | null;
    rotation_warn: boolean;
    has_probe: boolean;
}

interface Alert {
    id: string;
    alert_type: string;
    severity: string;
    title: string;
    detail: string | null;
    fired_at: string;
    resolved_at: string | null;
}

interface Sample {
    source: string;
    captured_at: string | null;
    body: unknown;
}

interface ProbeResult {
    status: string;
    detail?: string | null;
    elapsed_ms?: number;
    checked_at: string;
}

function fmtRelative(ts: string | null | undefined): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtAbsolute(ts: string | null | undefined): string {
    if (!ts) return "—";
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function statusToTone(status: string | null | undefined, configured: boolean): { tone: StatusTone; label: string } {
    if (!configured) return { tone: "unknown", label: "Not configured" };
    if (status === "ok") return { tone: "ok", label: "Healthy" };
    if (status === "error") return { tone: "error", label: "Failing" };
    if (status === "disabled") return { tone: "unknown", label: "Disabled" };
    return { tone: "warn", label: "Unprobed" };
}

export default function IntegrationDetailPage() {
    const params = useParams<{ slug: string }>();
    const slug = params.slug;
    const [connector, setConnector] = useState<Connector | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [sample, setSample] = useState<Sample | null>(null);
    const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [probing, setProbing] = useState(false);
    const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/health/integrations/${slug}`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setConnector(data.connector);
            setAlerts(data.alerts || []);
            setSample(data.sample || null);
            setLastSuccessAt(data.last_success_at || null);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => { load(); }, [load]);

    async function runProbe() {
        setProbing(true);
        setProbeResult(null);
        try {
            const res = await fetch(`/api/admin/health/integrations/${slug}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "test" }),
                cache: "no-store",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setProbeResult(data);
            // Refresh the cached row so the header status pill matches.
            await load();
        } catch (e) {
            setProbeResult({ status: "error", detail: (e as Error).message, checked_at: new Date().toISOString() });
        } finally {
            setProbing(false);
        }
    }

    if (loading && !connector) {
        return (
            <div className="w-full max-w-4xl mx-auto py-16 text-center text-stone-400 text-sm">
                Loading {slug}…
            </div>
        );
    }
    if (err || !connector) {
        return (
            <div className="w-full max-w-4xl mx-auto py-16 text-center">
                <p className="text-rose-700 text-sm font-bold">{err || "Connector not found"}</p>
                <Link href="/admin/health/integrations" className="text-xs text-stone-500 hover:text-stone-800 mt-2 inline-block">
                    ← Back to Integrations
                </Link>
            </div>
        );
    }

    const headerTone = statusToTone(connector.last_status, connector.configured);
    const probeTone = probeResult ? statusToTone(probeResult.status, connector.configured) : null;
    const expiryColor =
        connector.days_until_expiry === null ? "text-stone-400" :
        connector.days_until_expiry <= 0 ? "text-rose-700" :
        connector.days_until_expiry <= 3 ? "text-rose-700" :
        connector.days_until_expiry <= 14 ? "text-amber-700" :
        "text-emerald-700";

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 pb-12">
            <header className="space-y-2">
                <Link href="/admin/health/integrations" className="text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> All integrations
                </Link>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">{connector.category}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                                <Plug className="w-6 h-6" /> {connector.label}
                            </h1>
                            <StatusBadge tone={headerTone.tone} label={headerTone.label} />
                        </div>
                        <p className="text-xs text-stone-500 mt-1 font-mono">{connector.env_var_name}</p>
                    </div>
                    <ActionButton onClick={load} loading={loading} icon={RefreshCw}>Refresh</ActionButton>
                </div>
                {connector.notes && (
                    <p className="text-sm text-stone-600 max-w-2xl pt-1">{connector.notes}</p>
                )}
            </header>

            {/* Test connection card */}
            <section className="bg-white border border-stone-200 rounded-[28px] p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-emerald-500" /> Live probe
                        </h2>
                        <p className="text-xs text-stone-500 mt-1 max-w-md">
                            Hits the upstream auth/health endpoint with the configured key. Persists the result so the integrations list reflects the latest check.
                        </p>
                    </div>
                    <ActionButton
                        tone="primary"
                        onClick={runProbe}
                        loading={probing}
                        icon={Zap}
                        disabled={!connector.has_probe}
                    >
                        Test connection
                    </ActionButton>
                </div>

                {!connector.has_probe && (
                    <div className="mt-3 text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-xl p-3">
                        No probe is registered for this slug. Add an entry to <code>src/lib/connectors.ts</code> to enable on-demand testing.
                    </div>
                )}

                {probeResult && probeTone && (
                    <div className={clsx(
                        "mt-4 rounded-2xl border p-4 flex items-start gap-3",
                        probeResult.status === "ok" ? "bg-emerald-50 border-emerald-200" :
                        probeResult.status === "error" ? "bg-rose-50 border-rose-200" :
                        "bg-stone-50 border-stone-200",
                    )}>
                        {probeResult.status === "ok"
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            : <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-stone-900">{probeTone.label}</p>
                            {probeResult.detail && <p className="text-xs text-stone-600 mt-0.5">{probeResult.detail}</p>}
                            <p className="text-[10px] text-stone-400 mt-1">
                                {fmtAbsolute(probeResult.checked_at)}{probeResult.elapsed_ms != null ? ` · ${probeResult.elapsed_ms}ms` : ""}
                            </p>
                        </div>
                    </div>
                )}
            </section>

            {/* Env + rotation summary grid */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-stone-200 rounded-[28px] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">Env var</p>
                    <p className="text-sm font-bold text-stone-900 break-all">{connector.env_var_name}</p>
                    <p className={clsx("text-xs mt-2 inline-flex items-center gap-1", connector.configured ? "text-emerald-700" : "text-stone-500")}>
                        {connector.configured ? <><CheckCircle2 className="w-3 h-3" /> set</> : <><AlertTriangle className="w-3 h-3" /> not set</>}
                    </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-[28px] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1 flex items-center gap-1">
                        <Key className="w-3 h-3" /> Rotation
                    </p>
                    <p className={clsx("text-2xl font-black tabular-nums", expiryColor)}>
                        {connector.days_until_expiry === null
                            ? "—"
                            : connector.days_until_expiry <= 0
                            ? `expired`
                            : `${connector.days_until_expiry}d`}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1">
                        {connector.rotation_days ? `every ${connector.rotation_days}d` : "no cadence set"}
                        {connector.expires_at && (
                            <> · expires {fmtAbsolute(connector.expires_at).split(",")[0]}</>
                        )}
                    </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-[28px] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Last successful call
                    </p>
                    <p className="text-sm font-bold text-stone-900">{fmtRelative(lastSuccessAt)}</p>
                    {sample?.source && (
                        <p className="text-[11px] text-stone-500 mt-1 truncate" title={sample.source}>via {sample.source}</p>
                    )}
                </div>
            </section>

            {/* Cached probe / monitor state */}
            <section className="bg-white border border-stone-200 rounded-[28px] p-5">
                <h2 className="text-sm font-bold text-stone-900 mb-3 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Health monitor (hourly cache)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase">Last status</p>
                        <p className="font-bold text-stone-900">{connector.last_status || "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase">Last check</p>
                        <p className="font-bold text-stone-900">{fmtRelative(connector.last_check_at)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase">Consecutive fails</p>
                        <p className={clsx("font-bold", connector.consecutive_fails > 0 ? "text-rose-700" : "text-stone-900")}>
                            {connector.consecutive_fails}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase">Probe registered</p>
                        <p className="font-bold text-stone-900">{connector.has_probe ? "yes" : "no"}</p>
                    </div>
                </div>
                {connector.last_detail && (
                    <p className="text-[11px] text-stone-500 mt-3 italic">Detail: {connector.last_detail}</p>
                )}
            </section>

            {/* Sample payload */}
            <section className="bg-white border border-stone-200 rounded-[28px] p-5">
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div>
                        <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                            <FileJson className="w-4 h-4" /> Sample last-call payload
                        </h2>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                            {sample
                                ? <>From <code className="bg-stone-100 px-1 py-0.5 rounded">{sample.source}</code> · {fmtAbsolute(sample.captured_at)}</>
                                : "No domain table tracks this integration's traffic yet."}
                        </p>
                    </div>
                    {sample && (
                        <ActionButton onClick={() => setDrawerOpen(true)} icon={Eye}>View payload</ActionButton>
                    )}
                </div>
                {sample && (
                    <pre className="bg-stone-50 border border-stone-100 rounded-xl p-3 text-[10px] text-stone-700 overflow-x-auto max-h-32 leading-snug">
                        {JSON.stringify(sample.body, null, 2).slice(0, 600)}
                        {JSON.stringify(sample.body, null, 2).length > 600 ? "\n…" : ""}
                    </pre>
                )}
            </section>

            {/* Recent alerts */}
            <section>
                <h2 className="text-sm font-bold text-stone-900 mb-3 flex items-center gap-1.5">
                    <Bell className="w-4 h-4" /> Recent health alerts
                </h2>
                <DataTable<Alert>
                    rows={alerts}
                    rowKey={(r) => r.id}
                    emptyMessage="No alerts in the last 30 days. Quiet is good."
                    columns={[
                        {
                            key: "title",
                            header: "Title",
                            render: (r) => (
                                <div>
                                    <p className="font-bold text-stone-900">{r.title}</p>
                                    {r.detail && <p className="text-[11px] text-stone-500 mt-0.5">{r.detail}</p>}
                                </div>
                            ),
                        },
                        {
                            key: "type",
                            header: "Type",
                            render: (r) => <code className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded">{r.alert_type}</code>,
                        },
                        {
                            key: "severity",
                            header: "Severity",
                            align: "center",
                            render: (r) => (
                                <StatusBadge
                                    tone={r.severity === "critical" ? "error" : r.severity === "warning" ? "warn" : "unknown"}
                                    label={r.severity}
                                />
                            ),
                        },
                        {
                            key: "fired",
                            header: "Fired",
                            align: "right",
                            render: (r) => <span className="text-stone-500">{fmtRelative(r.fired_at)}</span>,
                        },
                        {
                            key: "state",
                            header: "State",
                            align: "right",
                            render: (r) => r.resolved_at
                                ? <span className="text-emerald-700 font-bold">resolved</span>
                                : <span className="text-rose-700 font-bold">open</span>,
                        },
                    ]}
                />
            </section>

            {/* Doc + rotate links */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {connector.docs_url && (
                    <a
                        href={connector.docs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all inline-flex items-center justify-between gap-2"
                    >
                        <span>
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider">Docs</p>
                            <p className="text-sm font-bold text-stone-900 truncate">{new URL(connector.docs_url).hostname}</p>
                        </span>
                        <ExternalLink className="w-4 h-4 text-stone-400" />
                    </a>
                )}
                {connector.rotate_url && (
                    <a
                        href={connector.rotate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all inline-flex items-center justify-between gap-2"
                    >
                        <span>
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider">Rotate key</p>
                            <p className="text-sm font-bold text-stone-900 truncate">{new URL(connector.rotate_url).hostname}</p>
                        </span>
                        <ExternalLink className="w-4 h-4 text-stone-400" />
                    </a>
                )}
            </section>

            <SampleDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title="Sample payload"
                subtitle={sample ? `From ${sample.source} · ${fmtAbsolute(sample.captured_at)}` : ""}
            >
                <pre className="bg-stone-50 border border-stone-100 rounded-xl p-3 text-[11px] text-stone-700 overflow-x-auto leading-relaxed">
                    {JSON.stringify(sample?.body ?? {}, null, 2)}
                </pre>
            </SampleDrawer>
        </div>
    );
}
