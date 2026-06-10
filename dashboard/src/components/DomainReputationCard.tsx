"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, Shield } from "lucide-react";

type AuthCheck = {
    record: string | null;
    pass: boolean;
    reason: string;
};

type Snapshot = {
    domain: string;
    checked_at: string;
    spf: AuthCheck;
    dkim: AuthCheck;
    dmarc: AuthCheck;
    previous_snapshot: {
        snapshot_at: string;
        spf_pass: boolean | null;
        dkim_pass: boolean | null;
        dmarc_pass: boolean | null;
        bounce_rate: number | null;
        complaint_rate: number | null;
        gmail_inbox_rate: number | null;
    } | null;
};

/**
 * Domain reputation card — drop into /admin/outreach Settings tab.
 *
 *   <DomainReputationCard domain="capturepilot.com" />
 *
 * Defaults to the FROM_EMAIL domain when no prop is passed (server resolves).
 */
export default function DomainReputationCard({ domain }: { domain?: string }) {
    const [data, setData] = useState<Snapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const url = domain
                ? `/api/admin/outreach/domain-auth?domain=${encodeURIComponent(domain)}`
                : `/api/admin/outreach/domain-auth`;
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [domain]);

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-slate-700" />
                    <h3 className="text-base font-semibold text-slate-900">Domain Authentication</h3>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Re-check now
                </button>
            </div>

            {data?.domain && (
                <p className="mt-1 text-xs text-slate-500">
                    Checking <span className="font-mono">{data.domain}</span>
                    {data.checked_at && (
                        <> · last checked {new Date(data.checked_at).toLocaleString()}</>
                    )}
                </p>
            )}

            {error && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {data && (
                <div className="mt-4 space-y-2">
                    <AuthRow label="SPF" check={data.spf} />
                    <AuthRow label="DKIM" check={data.dkim} />
                    <AuthRow label="DMARC" check={data.dmarc} />
                </div>
            )}

            {data?.previous_snapshot && (
                <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                            Bounce rate:{" "}
                            <span className="font-medium text-slate-700">
                                {fmtPct(data.previous_snapshot.bounce_rate)}
                            </span>
                            {(data.previous_snapshot.bounce_rate ?? 0) > 0.02 && (
                                <span className="ml-1 text-red-600">(over 2% red line)</span>
                            )}
                        </span>
                        <span>
                            Complaint rate:{" "}
                            <span className="font-medium text-slate-700">
                                {fmtPct(data.previous_snapshot.complaint_rate)}
                            </span>
                            {(data.previous_snapshot.complaint_rate ?? 0) > 0.001 && (
                                <span className="ml-1 text-red-600">(over 0.1% red line)</span>
                            )}
                        </span>
                        <span>
                            Gmail inbox rate:{" "}
                            <span className="font-medium text-slate-700">
                                {fmtPct(data.previous_snapshot.gmail_inbox_rate)}
                            </span>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function AuthRow({ label, check }: { label: string; check: AuthCheck }) {
    return (
        <div className="flex items-start gap-3 rounded-md bg-slate-50 px-3 py-2">
            {check.pass ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            ) : (
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{label}</span>
                    <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            check.pass
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                        }`}
                    >
                        {check.pass ? "PASS" : "FAIL"}
                    </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{check.reason}</p>
                {check.record && (
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={check.record}>
                        {check.record}
                    </p>
                )}
            </div>
        </div>
    );
}

function fmtPct(v: number | null | undefined): string {
    if (v === null || v === undefined) return "—";
    return `${(v * 100).toFixed(2)}%`;
}
