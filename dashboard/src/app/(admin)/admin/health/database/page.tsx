"use client";

/**
 * /admin/health/database — Supabase table overview.
 *
 *   - Left pane: searchable list of every public table with row count,
 *     size, last insert/update timestamp, and primary key column(s).
 *   - Click a row → SampleDrawer slides in from the right with the 50
 *     most-recent rows (JSON pretty-printed).
 *   - "View schema" link inside the drawer flips it to a read-only column
 *     list (name / type / nullable / default / PK).
 *   - Sensitive tables (users, contracts, contacts, leads, billing, …)
 *     render an indigo "PII" badge. Trying to load sample rows from one
 *     prompts a confirmation; only after explicit confirm does the
 *     request go out with ?confirm=true.
 *
 * All data comes from /api/admin/db/{tables,sample,schema} — those routes
 * call assertAdmin() + redact secret-bearing columns. The admin shell
 * layout already enforces auth at the chrome level too.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Database, RefreshCw, Search, Loader2, ShieldAlert,
    Key, Clock, ChevronLeft, Code2, Table2, FileJson,
    ArrowLeft, AlertCircle,
} from "lucide-react";
import clsx from "clsx";

import { HealthCard } from "@/components/admin/health/HealthCard";
import { StatusBadge } from "@/components/admin/health/StatusBadge";
import { ActionButton } from "@/components/admin/health/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/admin/health/DataTable";
import { SampleDrawer } from "@/components/admin/health/SampleDrawer";

interface TableRow {
    table: string;
    row_count: number;
    size_bytes: number;
    size_pretty: string;
    primary_key: string[];
    last_inserted: string | null;
    last_updated: string | null;
    sensitive: boolean;
}

interface SchemaColumn {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
    is_pk: boolean;
}

interface SchemaResponse {
    table: string;
    column_count: number;
    primary_key: string[];
    columns: SchemaColumn[];
}

interface SampleResponse {
    table: string;
    ordered_by: string | null;
    sensitive: boolean;
    row_count: number;
    rows: Record<string, unknown>[];
}

function fmtRelative(ts: string | null): string {
    if (!ts) return "—";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 0) return "in the future";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtRows(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

type DrawerView = "sample" | "schema";

export default function DatabaseHealthPage() {
    const [tables, setTables] = useState<TableRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [q, setQ] = useState("");

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerTable, setDrawerTable] = useState<TableRow | null>(null);
    const [drawerView, setDrawerView] = useState<DrawerView>("sample");
    const [sample, setSample] = useState<SampleResponse | null>(null);
    const [schema, setSchema] = useState<SchemaResponse | null>(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [drawerErr, setDrawerErr] = useState<string | null>(null);
    const [needConfirm, setNeedConfirm] = useState(false);

    async function loadTables() {
        setLoading(true);
        setErr(null);
        try {
            const r = await fetch("/api/admin/db/tables", { cache: "no-store" });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setTables(j.tables as TableRow[]);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadTables(); }, []);

    async function openSample(t: TableRow, confirm = false) {
        setDrawerTable(t);
        setDrawerView("sample");
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerErr(null);
        setNeedConfirm(false);
        setSample(null);
        try {
            const url = `/api/admin/db/sample?table=${encodeURIComponent(t.table)}&limit=50${confirm ? "&confirm=true" : ""}`;
            const r = await fetch(url, { cache: "no-store" });
            const j = await r.json();
            if (r.status === 409 && j.error === "CONFIRMATION_REQUIRED") {
                setNeedConfirm(true);
                return;
            }
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setSample(j as SampleResponse);
        } catch (e) {
            setDrawerErr((e as Error).message);
        } finally {
            setDrawerLoading(false);
        }
    }

    async function openSchema(t: TableRow) {
        setDrawerTable(t);
        setDrawerView("schema");
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerErr(null);
        setSchema(null);
        try {
            const r = await fetch(`/api/admin/db/schema?table=${encodeURIComponent(t.table)}`, { cache: "no-store" });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setSchema(j as SchemaResponse);
        } catch (e) {
            setDrawerErr((e as Error).message);
        } finally {
            setDrawerLoading(false);
        }
    }

    function closeDrawer() {
        setDrawerOpen(false);
        setDrawerTable(null);
        setSample(null);
        setSchema(null);
        setDrawerErr(null);
        setNeedConfirm(false);
    }

    // Roll-up KPIs for the header.
    const totals = useMemo(() => {
        if (!tables) return { count: 0, totalRows: 0, totalSize: 0, sensitive: 0 };
        return {
            count: tables.length,
            totalRows: tables.reduce((s, t) => s + (t.row_count || 0), 0),
            totalSize: tables.reduce((s, t) => s + (t.size_bytes || 0), 0),
            sensitive: tables.filter(t => t.sensitive).length,
        };
    }, [tables]);

    const filtered = useMemo(() => {
        if (!tables) return [] as TableRow[];
        const needle = q.trim().toLowerCase();
        const list = needle
            ? tables.filter(t => t.table.includes(needle))
            : tables.slice();
        // Largest tables first — that's almost always what an admin
        // skimming this page cares about.
        list.sort((a, b) => b.size_bytes - a.size_bytes);
        return list;
    }, [tables, q]);

    const columns: DataTableColumn<TableRow>[] = [
        {
            key: "table",
            header: "Table",
            render: (r) => (
                <button
                    type="button"
                    onClick={() => openSample(r)}
                    className="flex items-center gap-2 text-left text-stone-900 font-mono font-semibold hover:text-emerald-700"
                >
                    <Table2 className="w-3.5 h-3.5 text-stone-400" />
                    {r.table}
                    {r.sensitive && (
                        <StatusBadge tone="warn" label="PII" />
                    )}
                </button>
            ),
        },
        {
            key: "rows",
            header: "Rows (est.)",
            align: "right",
            render: (r) => <span className="tabular-nums">{fmtRows(r.row_count)}</span>,
        },
        {
            key: "size",
            header: "Size",
            align: "right",
            render: (r) => <span className="tabular-nums text-stone-500">{r.size_pretty}</span>,
        },
        {
            key: "pk",
            header: "Primary key",
            render: (r) => r.primary_key.length === 0
                ? <span className="text-stone-300">—</span>
                : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-600 font-mono">
                        <Key className="w-3 h-3 text-amber-500" />
                        {r.primary_key.join(", ")}
                    </span>
                ),
        },
        {
            key: "inserted",
            header: "Last insert",
            align: "right",
            render: (r) => (
                <span title={r.last_inserted || ""} className="text-stone-500 text-[11px]">
                    {fmtRelative(r.last_inserted)}
                </span>
            ),
        },
        {
            key: "updated",
            header: "Last update",
            align: "right",
            render: (r) => (
                <span title={r.last_updated || ""} className="text-stone-500 text-[11px]">
                    {fmtRelative(r.last_updated)}
                </span>
            ),
        },
        {
            key: "actions",
            header: "",
            align: "right",
            render: (r) => (
                <div className="flex items-center gap-1.5 justify-end">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openSchema(r); }}
                        className="text-[11px] font-semibold text-stone-500 hover:text-emerald-700 inline-flex items-center gap-1"
                        title="View schema (columns + types)"
                    >
                        <Code2 className="w-3 h-3" /> Schema
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openSample(r); }}
                        className="text-[11px] font-semibold text-stone-500 hover:text-emerald-700 inline-flex items-center gap-1"
                        title="Sample most-recent rows"
                    >
                        <FileJson className="w-3 h-3" /> Sample
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link
                        href="/admin/health"
                        className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5 inline-flex items-center gap-1 hover:text-stone-600"
                    >
                        <ArrowLeft className="w-3 h-3" /> Operations · Env Health
                    </Link>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2 mt-1">
                        <Database className="w-6 h-6" /> Database
                    </h1>
                    <p className="text-sm text-stone-500 mt-1 max-w-2xl">
                        Live overview of every public table in Supabase. Click a row to slide in 50 sample rows.
                        Sensitive tables require an explicit confirmation before sample data is loaded; secret-bearing
                        columns (passwords, API keys, Stripe IDs) are always redacted server-side.
                    </p>
                </div>
                <ActionButton onClick={loadTables} loading={loading} icon={RefreshCw}>
                    Refresh
                </ActionButton>
            </header>

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <HealthCard
                    label="Public tables"
                    title="Tables"
                    icon={Table2}
                    value={totals.count}
                />
                <HealthCard
                    label="Estimated rows"
                    title="Total rows"
                    icon={Database}
                    value={fmtRows(totals.totalRows)}
                />
                <HealthCard
                    label="On disk"
                    title="Total size"
                    icon={Database}
                    value={`${(totals.totalSize / 1_073_741_824).toFixed(2)} GB`}
                    footer={<span className="text-stone-400">includes indexes + toast</span>}
                />
                <HealthCard
                    label="Flagged"
                    title="Sensitive tables"
                    icon={ShieldAlert}
                    value={totals.sensitive}
                    valueTone={totals.sensitive > 0 ? "warn" : "default"}
                    footer={<span className="text-stone-400">require confirm to sample</span>}
                />
            </div>

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold">Failed to load tables</p>
                        <p className="text-xs mt-0.5">{err}</p>
                    </div>
                </div>
            )}

            {/* Search + table list */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Filter tables…"
                            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                    </div>
                    {tables && (
                        <span className="text-xs text-stone-500">
                            {filtered.length} of {tables.length}
                        </span>
                    )}
                </div>

                {loading && !tables ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        rows={filtered}
                        rowKey={(r) => r.table}
                        emptyMessage={q ? `No tables match "${q}".` : "No tables found."}
                    />
                )}
            </section>

            {/* Slide-out drawer — sample rows OR schema */}
            <SampleDrawer
                open={drawerOpen}
                onClose={closeDrawer}
                title={drawerTable?.table || ""}
                subtitle={drawerTable && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge tone="unknown" label={drawerView === "sample" ? "Sample" : "Schema"} />
                        {drawerTable.sensitive && <StatusBadge tone="warn" label="PII" />}
                        <span className="text-stone-400">·</span>
                        <span>{fmtRows(drawerTable.row_count)} rows · {drawerTable.size_pretty}</span>
                    </div>
                )}
            >
                {drawerTable && (
                    <div className="flex items-center gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => drawerTable && openSample(drawerTable, drawerTable.sensitive)}
                            className={clsx(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                                drawerView === "sample"
                                    ? "bg-stone-900 text-white"
                                    : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50",
                            )}
                        >
                            <FileJson className="w-3 h-3" /> Sample rows
                        </button>
                        <button
                            type="button"
                            onClick={() => drawerTable && openSchema(drawerTable)}
                            className={clsx(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                                drawerView === "schema"
                                    ? "bg-stone-900 text-white"
                                    : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50",
                            )}
                        >
                            <Code2 className="w-3 h-3" /> Schema
                        </button>
                    </div>
                )}

                {drawerErr && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 mb-3">
                        {drawerErr}
                    </div>
                )}

                {/* Sensitive-table gate */}
                {drawerView === "sample" && needConfirm && drawerTable && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-3">
                        <div className="flex items-start gap-3">
                            <ShieldAlert className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-bold text-sm text-indigo-900">Sensitive table</p>
                                <p className="text-xs text-indigo-800 mt-1">
                                    <code className="font-mono">{drawerTable.table}</code> may contain
                                    personal data, billing identifiers, or other regulated information.
                                    Continue only if you have a legitimate operational reason to view
                                    these rows. Sample data will appear here; secret-bearing columns
                                    are still redacted.
                                </p>
                                <div className="mt-3 flex items-center gap-2">
                                    <ActionButton
                                        onClick={() => openSample(drawerTable, true)}
                                        tone="primary"
                                        icon={FileJson}
                                    >
                                        Show sample rows
                                    </ActionButton>
                                    <ActionButton onClick={closeDrawer} icon={ChevronLeft}>
                                        Cancel
                                    </ActionButton>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {drawerLoading && (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                    </div>
                )}

                {/* Schema view */}
                {drawerView === "schema" && schema && !drawerLoading && (
                    <div className="space-y-3">
                        <div className="text-xs text-stone-500">
                            <span className="font-bold text-stone-700">{schema.column_count}</span> columns
                            {schema.primary_key.length > 0 && (
                                <>
                                    {" · PK: "}
                                    <code className="font-mono text-amber-700">{schema.primary_key.join(", ")}</code>
                                </>
                            )}
                        </div>
                        <div className="border border-stone-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-stone-50 text-[10px] text-stone-400 uppercase tracking-wider">
                                    <tr>
                                        <th className="text-left px-3 py-2">Column</th>
                                        <th className="text-left px-3 py-2">Type</th>
                                        <th className="text-center px-3 py-2">Null</th>
                                        <th className="text-left px-3 py-2">Default</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100">
                                    {schema.columns.map((c) => (
                                        <tr key={c.name} className="hover:bg-stone-50/60">
                                            <td className="px-3 py-2 font-mono text-stone-800">
                                                <span className="inline-flex items-center gap-1">
                                                    {c.is_pk && <Key className="w-3 h-3 text-amber-500" />}
                                                    {c.name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-stone-500">{c.type}</td>
                                            <td className="px-3 py-2 text-center">
                                                {c.nullable
                                                    ? <span className="text-stone-300">·</span>
                                                    : <span className="text-rose-500 font-bold text-[10px]">NO</span>}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-stone-400 text-[10px] truncate max-w-[180px]" title={c.default || ""}>
                                                {c.default || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Sample-rows view */}
                {drawerView === "sample" && sample && !drawerLoading && !needConfirm && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Clock className="w-3 h-3" />
                            Showing <span className="font-bold text-stone-700">{sample.row_count}</span> most-recent rows
                            {sample.ordered_by && (
                                <>
                                    {" ordered by "}
                                    <code className="font-mono text-stone-700">{sample.ordered_by} desc</code>
                                </>
                            )}
                        </div>
                        {sample.rows.length === 0 ? (
                            <div className="border border-dashed border-stone-200 rounded-2xl p-8 text-center text-xs text-stone-400">
                                Table is empty.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sample.rows.map((row, idx) => (
                                    <details
                                        key={idx}
                                        className="border border-stone-200 rounded-xl bg-stone-50/60 open:bg-white"
                                        open={idx < 3}
                                    >
                                        <summary className="px-3 py-2 cursor-pointer text-[11px] font-mono text-stone-600 flex items-center gap-2">
                                            <span className="text-stone-400">row {idx + 1}</span>
                                            <span className="truncate">
                                                {String(
                                                    (row as Record<string, unknown>).id
                                                    ?? (row as Record<string, unknown>).slug
                                                    ?? (row as Record<string, unknown>).name
                                                    ?? (row as Record<string, unknown>).title
                                                    ?? "",
                                                )}
                                            </span>
                                        </summary>
                                        <pre className="px-3 py-2 text-[11px] text-stone-700 overflow-x-auto leading-relaxed">
{JSON.stringify(row, null, 2)}
                                        </pre>
                                    </details>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </SampleDrawer>
        </div>
    );
}
