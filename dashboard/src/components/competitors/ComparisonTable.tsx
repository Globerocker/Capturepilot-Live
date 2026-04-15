"use client";

import Link from "next/link";
import { X, ExternalLink, TrendingUp, Users, Globe } from "lucide-react";
import clsx from "clsx";

export interface ComparisonCompetitor {
    id: string;
    competitor_name: string;
    website: string | null;
    uei: string | null;
    naics_codes: string[] | null;
    employee_count: string | null;
    revenue_estimate: string | null;
    description: string | null;
    overlap_score: number;
    federal_presence: string | null;
    crawl_data: Record<string, unknown> | null;
}

interface Props {
    competitors: ComparisonCompetitor[];
    onClose: () => void;
}

function formatRevenue(raw: string | null): string {
    if (!raw) return "—";
    if (raw.startsWith("$")) return raw;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) return raw;
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
}

function formatEmployees(raw: string | null): string {
    if (!raw) return "—";
    const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (isNaN(num)) return raw;
    if (num >= 10_000) return `${(num / 1_000).toFixed(0)}K+`;
    return num.toLocaleString();
}

function asArray(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
    return [];
}

const presenceColors: Record<string, string> = {
    strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
    moderate: "bg-amber-100 text-amber-700 border-amber-200",
    limited: "bg-blue-100 text-blue-700 border-blue-200",
    none: "bg-stone-100 text-stone-500 border-stone-200",
    unknown: "bg-stone-100 text-stone-400 border-stone-200",
};

export default function ComparisonTable({ competitors, onClose }: Props) {
    if (competitors.length === 0) return null;

    const rows: Array<{ label: string; render: (c: ComparisonCompetitor) => React.ReactNode }> = [
        {
            label: "Overlap %",
            render: (c) => (
                <span className={clsx(
                    "inline-block font-black text-lg",
                    c.overlap_score >= 70 ? "text-red-600" : c.overlap_score >= 40 ? "text-amber-600" : "text-blue-600"
                )}>
                    {c.overlap_score}%
                </span>
            ),
        },
        {
            label: "Employees",
            render: (c) => (
                <span className="inline-flex items-center gap-1 text-sm">
                    <Users className="w-3 h-3 text-stone-400" /> {formatEmployees(c.employee_count)}
                </span>
            ),
        },
        {
            label: "Revenue",
            render: (c) => (
                <span className="inline-flex items-center gap-1 text-sm">
                    <TrendingUp className="w-3 h-3 text-stone-400" /> {formatRevenue(c.revenue_estimate)}
                </span>
            ),
        },
        {
            label: "Federal Presence",
            render: (c) => (
                <span className={clsx(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                    presenceColors[c.federal_presence || "unknown"] || presenceColors.unknown
                )}>
                    {c.federal_presence || "unknown"}
                </span>
            ),
        },
        {
            label: "NAICS Codes",
            render: (c) => {
                const codes = c.naics_codes || [];
                if (codes.length === 0) return <span className="text-stone-400 text-xs">—</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {codes.slice(0, 8).map(code => (
                            <span key={code} className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">{code}</span>
                        ))}
                        {codes.length > 8 && <span className="text-[10px] text-stone-400">+{codes.length - 8}</span>}
                    </div>
                );
            },
        },
        {
            label: "Certifications",
            render: (c) => {
                const certs = asArray((c.crawl_data || {}).certifications);
                if (certs.length === 0) return <span className="text-stone-400 text-xs">—</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {certs.map(cert => (
                            <span key={cert} className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">{cert}</span>
                        ))}
                    </div>
                );
            },
        },
        {
            label: "Services",
            render: (c) => {
                const services = asArray((c.crawl_data || {}).services);
                if (services.length === 0) return <span className="text-stone-400 text-xs">—</span>;
                return (
                    <ul className="space-y-0.5 text-xs text-stone-700">
                        {services.slice(0, 6).map((s, i) => <li key={i}>• {s}</li>)}
                        {services.length > 6 && <li className="text-stone-400">+{services.length - 6} more</li>}
                    </ul>
                );
            },
        },
        {
            label: "Past Clients",
            render: (c) => {
                const list = asArray((c.crawl_data || {}).past_clients);
                if (list.length === 0) return <span className="text-stone-400 text-xs">—</span>;
                return (
                    <ul className="space-y-0.5 text-xs text-stone-700">
                        {list.slice(0, 6).map((s, i) => <li key={i}>• {s}</li>)}
                        {list.length > 6 && <li className="text-stone-400">+{list.length - 6} more</li>}
                    </ul>
                );
            },
        },
        {
            label: "Locations",
            render: (c) => {
                const list = asArray((c.crawl_data || {}).locations);
                if (list.length === 0) return <span className="text-stone-400 text-xs">—</span>;
                return (
                    <ul className="space-y-0.5 text-xs text-stone-700">
                        {list.slice(0, 6).map((s, i) => <li key={i}>• {s}</li>)}
                        {list.length > 6 && <li className="text-stone-400">+{list.length - 6} more</li>}
                    </ul>
                );
            },
        },
    ];

    return (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
                <h3 className="font-bold text-black text-sm">
                    Side-by-side comparison
                    <span className="ml-2 text-xs font-normal text-stone-500">({competitors.length} competitors)</span>
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg"
                >
                    <X className="w-3.5 h-3.5" /> Close comparison
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-stone-200">
                            <th className="sticky left-0 z-10 bg-white px-4 py-3 text-[10px] uppercase tracking-wider text-stone-400 font-bold min-w-[120px] border-r border-stone-200">
                                Company
                            </th>
                            {competitors.map(c => (
                                <th key={c.id} className="px-4 py-3 min-w-[200px] align-top">
                                    <Link
                                        href={`/competitors/${c.id}`}
                                        className="group inline-flex items-center gap-1 font-bold text-sm text-black hover:text-emerald-700 transition-colors"
                                    >
                                        <span className="line-clamp-2">{c.competitor_name}</span>
                                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </Link>
                                    {c.website && (
                                        <div className="text-[10px] text-stone-400 mt-1 inline-flex items-center gap-1">
                                            <Globe className="w-2.5 h-2.5" />
                                            {c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                        </div>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.label} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/50">
                                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-xs font-bold text-stone-600 uppercase tracking-wide border-r border-stone-200 align-top">
                                    {row.label}
                                </td>
                                {competitors.map(c => (
                                    <td key={c.id} className="px-4 py-3 align-top">
                                        {row.render(c)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
