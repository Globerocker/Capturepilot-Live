"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Building2, Mail, Phone, MapPin, ExternalLink, Globe, Trophy,
    ChevronDown, ChevronUp, ArrowRight, Hash, Award,
} from "lucide-react";
import clsx from "clsx";

/**
 * Compact contractor row with expandable dropdown.
 *
 * UX: single click expands inline (shows POC, top NAICS, award stats);
 * "Open full details" button navigates to /contract-winners/[uei].
 * Keeps list dense + scannable while giving instant snapshot access.
 *
 * Used on /contract-winners (primary), can be reused on a future
 * /partners search-results pane in suggestions mode.
 */

interface AgencyAward { name: string; amount: number; count: number }
interface NaicsAward { code: string; description: string; amount: number; count: number }

export interface ContractorRow {
    uei: string;
    company_name: string;
    dba_name?: string | null;
    state?: string | null;
    city?: string | null;
    naics_codes?: string[] | null;
    primary_naics_code?: string | null;
    email?: string | null;
    direct_phone?: string | null;
    primary_poc_name?: string | null;
    primary_poc_title?: string | null;
    business_url?: string | null;
    certifications?: string[] | null;
    federal_awards_count?: number | null;
    total_award_volume?: number | null;
    last_award_date?: string | null;
    agency_relationships?: AgencyAward[] | null;
    naics_awards?: NaicsAward[] | null;
}

function fmtMoney(n: number | null | undefined): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short" }); }
    catch { return iso; }
}

export function ContractorListCard({ c, defaultExpanded = false }: {
    c: ContractorRow;
    defaultExpanded?: boolean;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const hasAwards = (c.federal_awards_count ?? 0) > 0;

    return (
        <div className="bg-white border border-stone-200 hover:border-stone-300 rounded-xl overflow-hidden transition-colors">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full text-left p-4 hover:bg-stone-50 transition-colors flex items-center gap-3"
            >
                <Building2 className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-stone-900 truncate">{c.company_name}</span>
                        {c.dba_name && <span className="text-xs text-stone-400">(DBA {c.dba_name})</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px] text-stone-500">
                        {(c.city || c.state) && (
                            <span className="inline-flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                                {[c.city, c.state].filter(Boolean).join(", ")}
                            </span>
                        )}
                        {c.primary_naics_code && <span className="font-mono">{c.primary_naics_code}</span>}
                        {Array.isArray(c.certifications) && c.certifications.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                                {c.certifications.slice(0, 3).map((cert, i) => (
                                    <span key={i} className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 py-px rounded">
                                        {cert}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex-shrink-0 text-right">
                    {hasAwards ? (
                        <div className="flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5 text-amber-500" />
                            <div>
                                <div className="text-sm font-bold text-amber-900 tabular-nums">{c.federal_awards_count}</div>
                                <div className="text-[10px] text-amber-700 tabular-nums">{fmtMoney(c.total_award_volume)}</div>
                            </div>
                        </div>
                    ) : (
                        <span className="text-[10px] text-stone-400">No awards yet</span>
                    )}
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 pt-2 border-t border-stone-100 bg-stone-50/40 space-y-3">
                    {/* POC */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {(c.primary_poc_name || c.email || c.direct_phone) ? (
                            <div className="space-y-1">
                                {c.primary_poc_name && (
                                    <div className="text-stone-700">
                                        <span className="font-medium">{c.primary_poc_name}</span>
                                        {c.primary_poc_title && <span className="text-stone-500"> · {c.primary_poc_title}</span>}
                                    </div>
                                )}
                                {c.email && (
                                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800">
                                        <Mail className="w-3 h-3" /> {c.email}
                                    </a>
                                )}
                                {c.direct_phone && (
                                    <a href={`tel:${c.direct_phone}`} className="inline-flex items-center gap-1.5 text-stone-700 hover:text-stone-900 ml-3">
                                        <Phone className="w-3 h-3" /> {c.direct_phone}
                                    </a>
                                )}
                            </div>
                        ) : (
                            <div className="text-stone-400 italic">POC enrichment pending</div>
                        )}
                        <div className="text-stone-600 space-y-0.5 md:text-right">
                            {c.business_url && (
                                <a href={c.business_url.startsWith("http") ? c.business_url : `https://${c.business_url}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 hover:text-blue-600">
                                    <Globe className="w-3 h-3" /> {c.business_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                </a>
                            )}
                            {hasAwards && c.last_award_date && (
                                <div className="text-[10px] text-stone-500">Last award {fmtDate(c.last_award_date)}</div>
                            )}
                        </div>
                    </div>

                    {/* Top agencies */}
                    {Array.isArray(c.agency_relationships) && c.agency_relationships.length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500 mb-1">Top Agencies</div>
                            <div className="flex flex-wrap gap-1">
                                {c.agency_relationships.slice(0, 4).map((a, i) => (
                                    <span key={i} className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                                        {a.name} · {fmtMoney(a.amount)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* All NAICS */}
                    {Array.isArray(c.naics_codes) && c.naics_codes.length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500 mb-1">NAICS</div>
                            <div className="flex flex-wrap gap-1">
                                {c.naics_codes.slice(0, 8).map((n, i) => (
                                    <span key={i} className={clsx(
                                        "text-[10px] font-mono px-1.5 py-0.5 rounded",
                                        n === c.primary_naics_code ? "bg-blue-100 text-blue-800 font-bold" : "bg-stone-100 text-stone-600",
                                    )}>
                                        {n}
                                    </span>
                                ))}
                                {c.naics_codes.length > 8 && <span className="text-[10px] text-stone-400">+{c.naics_codes.length - 8}</span>}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <Link
                            href={`/contract-winners/${encodeURIComponent(c.uei)}`}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-stone-900 text-white hover:bg-stone-700 px-3 py-1.5 rounded-lg"
                        >
                            Open full details <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
