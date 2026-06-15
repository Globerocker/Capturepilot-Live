"use client";

import { Fragment, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Target,
    Loader2,
    AlertCircle,
    ArrowLeft,
    ChevronRight,
    ChevronDown,
    Mail,
    MapPin,
    Award,
    CheckCircle2,
    Sparkles,
    Building2,
} from "lucide-react";
import clsx from "clsx";
import OutreachNav from "@/components/outreach/OutreachNav";

/** Mirrors capability_summary_ai jsonb on contractors. All fields optional. */
interface CapabilitySummary {
    short_description?: string | null;
    nail_down_keywords?: string[] | null;
    capability_keywords?: string[] | null;
    services?: string[] | null;
    strengths?: string[] | null;
    pitch_angles?: string[] | null;
    has_gov_experience?: boolean | null;
    federal_agencies_served?: string[] | null;
    [key: string]: unknown;
}

interface ContractorRow {
    id: string;
    company_name: string | null;
    uei: string | null;
    email: string | null;
    state: string | null;
    naics_codes: string[] | null;
    federal_awards_count: number | null;
    last_award_date: string | null;
    years_in_business: number | null;
    qc_enriched: boolean | null;
    capability_summary_ai: CapabilitySummary | null;
}

const PAGE_SIZE = 50;

/** Human label for a segment key — falls back to a prettified key. */
const SEGMENT_LABELS: Record<string, string> = {
    dormant_performers: "Dormant past-performers",
    fresh_sam: "Freshly active in SAM",
    expiring_registration: "SAM registration expiring soon",
};

function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Chips({ items }: { items?: string[] | null }) {
    if (!items || items.length === 0) return <span className="text-stone-400 text-xs">—</span>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((it, i) => (
                <span
                    key={`${it}-${i}`}
                    className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-xs text-stone-700"
                >
                    {it}
                </span>
            ))}
        </div>
    );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1">{label}</div>
            {children}
        </div>
    );
}

function CapabilityPanel({ row }: { row: ContractorRow }) {
    const cap = row.capability_summary_ai;
    const empty = !cap || Object.keys(cap).length === 0;

    return (
        <div className="bg-stone-50 border-t border-stone-200 px-4 py-4">
            {empty ? (
                <div className="text-sm text-stone-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    No enriched capability data on file{row.qc_enriched ? " (enrichment ran but produced nothing)" : " — not yet enriched"}.
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="lg:col-span-2">
                        <DetailField label="Description">
                            {cap?.short_description ? (
                                <p className="text-sm text-stone-700 leading-relaxed">{cap.short_description}</p>
                            ) : (
                                <span className="text-stone-400 text-xs">—</span>
                            )}
                        </DetailField>
                    </div>

                    <DetailField label="Gov experience">
                        <span
                            className={clsx(
                                "inline-flex items-center gap-1.5 text-sm font-medium",
                                cap?.has_gov_experience ? "text-emerald-700" : "text-stone-500"
                            )}
                        >
                            {cap?.has_gov_experience ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4" /> Yes
                                </>
                            ) : (
                                "Not detected"
                            )}
                        </span>
                    </DetailField>

                    <DetailField label="Federal agencies served">
                        <Chips items={cap?.federal_agencies_served} />
                    </DetailField>

                    <DetailField label="Services">
                        <Chips items={cap?.services} />
                    </DetailField>

                    <DetailField label="Strengths">
                        <Chips items={cap?.strengths} />
                    </DetailField>

                    <DetailField label="Capability keywords">
                        <Chips items={cap?.capability_keywords} />
                    </DetailField>

                    <DetailField label="Nail-down keywords">
                        <Chips items={cap?.nail_down_keywords} />
                    </DetailField>

                    <div className="lg:col-span-2">
                        <DetailField label="Pitch angles">
                            {cap?.pitch_angles && cap.pitch_angles.length > 0 ? (
                                <ul className="list-disc list-inside space-y-1 text-sm text-stone-700">
                                    {cap.pitch_angles.map((p, i) => (
                                        <li key={`${p}-${i}`}>{p}</li>
                                    ))}
                                </ul>
                            ) : (
                                <span className="text-stone-400 text-xs">—</span>
                            )}
                        </DetailField>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SegmentDetailPage({ params }: { params: Promise<{ key: string }> }) {
    const { key } = use(params);

    const [rows, setRows] = useState<ContractorRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const label = SEGMENT_LABELS[key] || key.replace(/_/g, " ");

    const load = useCallback(async (p: number) => {
        setLoading(true);
        setError(null);
        try {
            const offset = p * PAGE_SIZE;
            const res = await fetch(
                `/api/admin/outreach/segments/${encodeURIComponent(key)}/contacts?limit=${PAGE_SIZE}&offset=${offset}`
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setRows(json.rows || []);
            setTotal(json.total || 0);
            setExpanded(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [key]);

    useEffect(() => { load(page); }, [load, page]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
    const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

    return (
        <div className="min-h-screen bg-stone-50">
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 pt-4">
                <div className="max-w-[1600px] mx-auto">
                    <Link
                        href="/admin/outreach/segments"
                        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 mb-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Target Groups
                    </Link>
                    <h1 className="font-bold text-lg flex items-center gap-2 mb-3">
                        <Target className="w-5 h-5" /> {label}
                    </h1>
                    <OutreachNav active="segments" />
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
                {error && (
                    <div className="mb-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-stone-500">
                        {loading ? "Loading…" : total === 0 ? "No contractors match this group." : (
                            <>Showing <span className="font-medium text-stone-700">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}</span> of <span className="font-medium text-stone-700">{total.toLocaleString()}</span></>
                        )}
                    </p>
                    <p className="text-xs text-stone-400">Click a row to inspect enriched data quality.</p>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
                                    <th className="px-4 py-3 w-8"><span className="sr-only">Expand</span></th>
                                    <th className="px-4 py-3">Company</th>
                                    <th className="px-4 py-3">Email</th>
                                    <th className="px-4 py-3">State</th>
                                    <th className="px-4 py-3">NAICS</th>
                                    <th className="px-4 py-3">Past awards</th>
                                    <th className="px-4 py-3">Years</th>
                                    <th className="px-4 py-3">Enriched</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-stone-500">
                                            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading contractors…</span>
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-stone-400">No contractors in this group.</td>
                                    </tr>
                                ) : (
                                    rows.map((r) => {
                                        const isOpen = expanded === r.id;
                                        const naics = r.naics_codes && r.naics_codes.length > 0
                                            ? r.naics_codes.slice(0, 3).join(", ") + (r.naics_codes.length > 3 ? ` +${r.naics_codes.length - 3}` : "")
                                            : "—";
                                        const awards = r.federal_awards_count && r.federal_awards_count > 0;
                                        return (
                                            <Fragment key={r.id}>
                                                <tr
                                                    onClick={() => setExpanded(isOpen ? null : r.id)}
                                                    className={clsx(
                                                        "border-b border-stone-100 cursor-pointer hover:bg-stone-50 transition-colors",
                                                        isOpen && "bg-stone-50"
                                                    )}
                                                >
                                                    <td className="px-4 py-3 text-stone-400">
                                                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-stone-900 inline-flex items-center gap-1.5">
                                                            <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                                            {r.company_name || "(unnamed)"}
                                                        </div>
                                                        {r.uei && <div className="text-xs text-stone-400 mt-0.5">UEI {r.uei}</div>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {r.email ? (
                                                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                                                                <Mail className="w-3.5 h-3.5" /> {r.email}
                                                            </span>
                                                        ) : (
                                                            <span className="text-stone-400">— no email</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-stone-600">
                                                        {r.state ? (
                                                            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-stone-400" /> {r.state}</span>
                                                        ) : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-stone-600">{naics}</td>
                                                    <td className="px-4 py-3 text-stone-600">
                                                        {awards ? (
                                                            <div>
                                                                <span className="inline-flex items-center gap-1.5 text-stone-700"><Award className="w-3.5 h-3.5 text-stone-400" /> Yes ({r.federal_awards_count})</span>
                                                                {r.last_award_date && (
                                                                    <div className="text-xs text-stone-400 mt-0.5">last {fmtDate(r.last_award_date)}</div>
                                                                )}
                                                            </div>
                                                        ) : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-stone-600">{r.years_in_business ?? "—"}</td>
                                                    <td className="px-4 py-3">
                                                        {r.qc_enriched ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-4 h-4" /></span>
                                                        ) : (
                                                            <span className="text-stone-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {isOpen && (
                                                    <tr>
                                                        <td colSpan={8} className="p-0">
                                                            <CapabilityPanel row={r} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-4">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0 || loading}
                            className="border border-stone-300 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed text-stone-700 font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                        >
                            <ArrowLeft className="w-4 h-4" /> Previous
                        </button>
                        <span className="text-sm text-stone-500">
                            Page {page + 1} of {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                            disabled={page + 1 >= totalPages || loading}
                            className="border border-stone-300 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed text-stone-700 font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                        >
                            Next <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <p className="mt-6 text-xs text-stone-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Enriched fields come from the QC capability-summary pass. Spot-check a few rows to judge whether the data is real before building a sending list.
                </p>
            </main>
        </div>
    );
}
