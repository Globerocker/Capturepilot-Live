"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Loader2, RefreshCw, HardDrive, Database,
    AlertCircle, ChevronLeft, Globe, Lock,
} from "lucide-react";
import { HealthCard } from "@/components/admin/health/HealthCard";
import { StatusBadge } from "@/components/admin/health/StatusBadge";
import { ActionButton } from "@/components/admin/health/ActionButton";

/**
 * /admin/health/storage — overview of every Supabase Storage bucket.
 *
 * Pulls from GET /api/admin/storage/buckets. Renders a KPI strip
 * (total buckets / public buckets / sampled objects / sampled bytes)
 * followed by one HealthCard per bucket linking into the detail view
 * at /admin/health/storage/[bucket].
 *
 * Auth: the admin layout already gates the entire (admin) shell, but the
 * API route below still calls assertAdmin() defense-in-depth.
 *
 * The "(sampled)" disclaimer is important: object_count is bounded by 1000
 * per bucket in the summary route — see that route's header comment.
 */

interface BucketSummary {
    name: string;
    id: string;
    public: boolean;
    created_at: string | null;
    updated_at: string | null;
    object_count: number;
    total_bytes: number;
    latest_upload: string | null;
    sampled: boolean;
    sample_limit: number;
    file_size_limit: number | null;
    allowed_mime_types: string[] | null;
    error?: string;
}

interface BucketsPayload {
    generated_at: string;
    totals: {
        buckets: number;
        public_buckets: number;
        objects: number;
        bytes: number;
    };
    buckets: BucketSummary[];
}

export function fmtBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
    const v = n / Math.pow(1000, i);
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function fmtRelative(ts: string | null): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function StorageHealthPage() {
    const [data, setData] = useState<BucketsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/storage/buckets", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setData(json as BucketsPayload);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link
                        href="/admin/health"
                        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5 hover:text-emerald-600"
                    >
                        <ChevronLeft className="w-3 h-3" /> Health
                    </Link>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <HardDrive className="w-6 h-6" /> Storage
                    </h1>
                    <p className="text-sm text-stone-500 mt-1 max-w-2xl">
                        Supabase Storage bucket overview. Per-bucket object counts and
                        size totals are sampled (max 1,000 objects per bucket at root)
                        — exact figures require a SQL query against{" "}
                        <code className="text-[11px] bg-stone-100 px-1 py-0.5 rounded">storage.objects</code>.
                        Click a bucket to inspect the 50 most-recent uploads with
                        per-file public or signed URLs.
                    </p>
                </div>
                <ActionButton onClick={load} loading={loading} icon={RefreshCw}>
                    Refresh
                </ActionButton>
            </header>

            {/* KPI strip */}
            {data && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Database className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black text-emerald-600 tabular-nums">{data.totals.buckets}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Buckets</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Globe className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black text-blue-600 tabular-nums">{data.totals.public_buckets}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Public Buckets</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <HardDrive className="w-4 h-4 text-stone-500 mb-1" />
                        <p className="text-2xl font-black text-stone-900 tabular-nums">{data.totals.objects.toLocaleString()}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Objects (sampled)</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Lock className="w-4 h-4 text-stone-500 mb-1" />
                        <p className="text-2xl font-black text-stone-900 tabular-nums">{fmtBytes(data.totals.bytes)}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Total (sampled)</p>
                    </div>
                </div>
            )}

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{err}</span>
                </div>
            )}

            {/* Bucket cards */}
            <section>
                <h2 className="text-sm font-bold text-stone-900 mb-3">Buckets</h2>
                {loading && !data ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(data?.buckets || []).map(b => (
                            <HealthCard
                                key={b.id}
                                label="Bucket"
                                icon={HardDrive}
                                title={b.name}
                                href={`/admin/health/storage/${encodeURIComponent(b.name)}`}
                                meta={
                                    <div className="flex flex-col items-end gap-1">
                                        <StatusBadge
                                            tone={b.public ? "public" : "private"}
                                            label={b.public ? "Public" : "Private"}
                                        />
                                        {b.error && <StatusBadge tone="error" label="Probe error" />}
                                        {b.sampled && !b.error && <StatusBadge tone="warn" label="Sample capped" />}
                                    </div>
                                }
                            >
                                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                                    <div>
                                        <p className="text-lg font-black text-stone-900 tabular-nums">
                                            {b.object_count.toLocaleString()}
                                            {b.sampled && <span className="text-stone-400">+</span>}
                                        </p>
                                        <p className="text-[10px] text-stone-500 uppercase mt-0.5">Objects</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-stone-900 tabular-nums">{fmtBytes(b.total_bytes)}</p>
                                        <p className="text-[10px] text-stone-500 uppercase mt-0.5">Size</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-stone-900 tabular-nums">{fmtRelative(b.latest_upload)}</p>
                                        <p className="text-[10px] text-stone-500 uppercase mt-0.5">Latest</p>
                                    </div>
                                </div>
                                {b.error && (
                                    <p className="mt-3 text-[11px] text-rose-700 bg-rose-50 rounded-lg px-2 py-1 break-words">
                                        {b.error}
                                    </p>
                                )}
                                {b.file_size_limit && (
                                    <p className="mt-2 text-[10px] text-stone-400">
                                        Max upload: {fmtBytes(b.file_size_limit)}
                                    </p>
                                )}
                            </HealthCard>
                        ))}
                    </div>
                )}
            </section>

            {data && (
                <p className="text-[10px] text-stone-400 text-right">
                    Generated {new Date(data.generated_at).toLocaleString()}
                </p>
            )}
        </div>
    );
}
