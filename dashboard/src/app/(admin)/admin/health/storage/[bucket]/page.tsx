"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
    Loader2, RefreshCw, HardDrive, ChevronLeft,
    ExternalLink, Folder, File as FileIcon, AlertCircle, ListChecks,
} from "lucide-react";
import { HealthCard } from "@/components/admin/health/HealthCard";
import { StatusBadge } from "@/components/admin/health/StatusBadge";
import { ActionButton } from "@/components/admin/health/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/admin/health/DataTable";
import { fmtBytes, fmtRelative } from "../page";

/**
 * /admin/health/storage/[bucket] — per-bucket detail.
 *
 * Lists the 50 most-recent objects (configurable limit up to 200) plus
 * any top-level folders so the admin can drill into nested prefixes
 * (e.g. capability-statements/{profile_id}/...). Each file row exposes
 * a public URL (public bucket) or a 10-minute signed URL (private bucket).
 *
 * No delete action on this iteration — too destructive.
 */

interface ObjectRow {
    name: string;
    path: string;
    kind: "file" | "folder";
    size: number | null;
    mime: string | null;
    updated_at: string | null;
    created_at: string | null;
    access_url: string | null;
    access_url_expires_at: string | null;
}

interface ListPayload {
    generated_at: string;
    bucket: {
        name: string;
        public: boolean;
        file_size_limit: number | null;
        allowed_mime_types: string[] | null;
        created_at: string | null;
        updated_at: string | null;
    };
    prefix: string;
    limit: number;
    signed_url_ttl_seconds: number | null;
    count: number;
    objects: ObjectRow[];
}

export default function BucketDetailPage({ params }: { params: Promise<{ bucket: string }> }) {
    const { bucket: bucketParam } = use(params);
    const bucket = decodeURIComponent(bucketParam);

    const [data, setData] = useState<ListPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [limit, setLimit] = useState(50);
    const [prefix, setPrefix] = useState("");

    async function load(nextPrefix = prefix, nextLimit = limit) {
        setLoading(true);
        setErr(null);
        try {
            const qs = new URLSearchParams({ bucket, limit: String(nextLimit) });
            if (nextPrefix) qs.set("prefix", nextPrefix);
            const res = await fetch(`/api/admin/storage/list?${qs.toString()}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setData(json as ListPayload);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load("", 50);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bucket]);

    function enterFolder(folderName: string) {
        const next = prefix ? `${prefix}/${folderName}` : folderName;
        setPrefix(next);
        load(next, limit);
    }
    function popFolder() {
        const parts = prefix.split("/").filter(Boolean);
        parts.pop();
        const next = parts.join("/");
        setPrefix(next);
        load(next, limit);
    }
    function reset() {
        setPrefix("");
        load("", limit);
    }

    const columns: DataTableColumn<ObjectRow>[] = [
        {
            key: "name",
            header: "Name",
            render: (row) => row.kind === "folder" ? (
                <button
                    type="button"
                    onClick={() => enterFolder(row.name)}
                    className="inline-flex items-center gap-1.5 text-stone-900 font-medium hover:text-emerald-600"
                >
                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                    {row.name}/
                </button>
            ) : (
                <span className="inline-flex items-center gap-1.5">
                    <FileIcon className="w-3.5 h-3.5 text-stone-400" />
                    <span className="font-mono text-[11px] text-stone-700 truncate max-w-[280px] inline-block align-bottom" title={row.path}>
                        {row.name}
                    </span>
                </span>
            ),
        },
        {
            key: "size",
            header: "Size",
            align: "right",
            render: (row) => row.kind === "folder" ? <span className="text-stone-300">—</span> : (
                <span className="tabular-nums">{row.size != null ? fmtBytes(row.size) : "—"}</span>
            ),
        },
        {
            key: "mime",
            header: "Type",
            render: (row) => row.kind === "folder" ? <span className="text-stone-300">folder</span> : (
                <span className="text-[10px] text-stone-500">{row.mime || "—"}</span>
            ),
        },
        {
            key: "updated",
            header: "Uploaded",
            align: "right",
            render: (row) => (
                <span className="text-stone-500" title={row.updated_at || ""}>
                    {fmtRelative(row.updated_at)}
                </span>
            ),
        },
        {
            key: "url",
            header: "Access",
            align: "right",
            render: (row) => row.kind === "folder" || !row.access_url ? (
                <span className="text-stone-300">—</span>
            ) : (
                <a
                    href={row.access_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-bold text-[11px]"
                    title={
                        data?.bucket.public
                            ? "Public URL"
                            : `Signed URL (expires ${row.access_url_expires_at ? new Date(row.access_url_expires_at).toLocaleTimeString() : "soon"})`
                    }
                >
                    Open <ExternalLink className="w-3 h-3" />
                </a>
            ),
        },
    ];

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link
                        href="/admin/health/storage"
                        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5 hover:text-emerald-600"
                    >
                        <ChevronLeft className="w-3 h-3" /> Storage
                    </Link>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <HardDrive className="w-6 h-6" /> {bucket}
                    </h1>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {data && (
                            <StatusBadge
                                tone={data.bucket.public ? "public" : "private"}
                                label={data.bucket.public ? "Public" : "Private"}
                            />
                        )}
                        {data?.bucket.file_size_limit && (
                            <span className="text-[10px] text-stone-500">
                                Max upload: {fmtBytes(data.bucket.file_size_limit)}
                            </span>
                        )}
                        {data?.signed_url_ttl_seconds && (
                            <span className="text-[10px] text-stone-500">
                                Signed URL TTL: {Math.round(data.signed_url_ttl_seconds / 60)} min
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={limit}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setLimit(v);
                            load(prefix, v);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-medium"
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                    </select>
                    <ActionButton onClick={() => load(prefix, limit)} loading={loading} icon={ListChecks}>
                        List recent objects
                    </ActionButton>
                    <ActionButton onClick={() => load(prefix, limit)} loading={loading} icon={RefreshCw}>
                        Refresh
                    </ActionButton>
                </div>
            </header>

            {/* Breadcrumb / prefix nav */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
                <button
                    type="button"
                    onClick={reset}
                    className="text-stone-500 hover:text-emerald-700 font-medium"
                >
                    /{bucket}
                </button>
                {prefix && prefix.split("/").filter(Boolean).map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-2">
                        <span className="text-stone-300">/</span>
                        {i === arr.length - 1 ? (
                            <span className="text-stone-700 font-semibold">{part}</span>
                        ) : (
                            <span className="text-stone-500">{part}</span>
                        )}
                    </span>
                ))}
                {prefix && (
                    <button
                        type="button"
                        onClick={popFolder}
                        className="ml-auto text-[11px] text-stone-500 hover:text-emerald-700 inline-flex items-center gap-1"
                    >
                        <ChevronLeft className="w-3 h-3" /> Up one level
                    </button>
                )}
            </div>

            {/* Bucket-level summary card */}
            {data && (
                <HealthCard
                    label="Bucket"
                    icon={HardDrive}
                    title={`${data.count} object${data.count === 1 ? "" : "s"} listed`}
                    footer={
                        <span>
                            Showing up to {data.limit} most-recent · sorted by{" "}
                            <code className="text-[10px] bg-stone-100 px-1 py-0.5 rounded">updated_at desc</code>
                            {data.bucket.allowed_mime_types && data.bucket.allowed_mime_types.length > 0 && (
                                <span> · allowed MIME: {data.bucket.allowed_mime_types.join(", ")}</span>
                            )}
                        </span>
                    }
                />
            )}

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{err}</span>
                </div>
            )}

            {loading && !data ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
            ) : (
                <DataTable<ObjectRow>
                    columns={columns}
                    rows={data?.objects || []}
                    rowKey={(row) => row.path}
                    emptyMessage={prefix ? `No objects in /${prefix}` : "No objects in this bucket yet."}
                />
            )}

            {data && (
                <p className="text-[10px] text-stone-400 text-right">
                    Generated {new Date(data.generated_at).toLocaleString()}
                </p>
            )}
        </div>
    );
}
