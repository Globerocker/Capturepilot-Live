"use client";

import Link from "next/link";
import { Bookmark, EyeOff, CheckCircle2, ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { MatchRow } from "./TableView";

const formatCurrency = (val: number | null | undefined) => {
    if (!val) return null;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
};

export function ListView({
    matches,
    selectedIds,
    onToggleSelect,
    onToggleSave,
    onDismiss,
    pursuedIds,
}: {
    matches: MatchRow[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleSave: (id: string, saved: boolean) => void;
    onDismiss: (id: string) => void;
    pursuedIds: Set<string>;
}) {
    return (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm divide-y divide-stone-100 overflow-hidden">
            {matches.map(m => {
                const opp = m.opportunities;
                if (!opp) return null;
                const pct = Math.round(m.score * 100);
                const isSelected = selectedIds.has(m.id);
                const daysLeft = opp.response_deadline
                    ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                return (
                    <div key={m.id} className={clsx("flex items-center gap-2 px-3 py-2 hover:bg-stone-50 transition-colors", isSelected && "bg-amber-50/30")}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(m.id)}
                            className="w-3.5 h-3.5 rounded border-stone-300 accent-black flex-shrink-0"
                        />
                        <span className={clsx(
                            "flex items-center justify-center w-10 h-8 rounded-md font-black text-[11px] border flex-shrink-0",
                            m.score >= 0.70 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : m.score >= 0.50 ? "text-amber-700 bg-amber-50 border-amber-200"
                                    : "text-blue-700 bg-blue-50 border-blue-200"
                        )}>{pct}%</span>
                        <Link href={`/opportunities/${opp.id}`} className="flex-1 min-w-0 flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-black truncate">{opp.title}</p>
                                <p className="text-[11px] text-stone-500 truncate">
                                    {opp.agency || "Federal Agency"}
                                    {opp.naics_code && <> · NAICS {opp.naics_code}</>}
                                    {opp.place_of_performance_state && <> · {opp.place_of_performance_state}</>}
                                    {opp.notice_type && <> · {opp.notice_type}</>}
                                </p>
                            </div>
                        </Link>
                        <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                            {formatCurrency(opp.award_amount) && (
                                <span className="font-bold text-emerald-700 whitespace-nowrap">{formatCurrency(opp.award_amount)}</span>
                            )}
                            {opp.set_aside_code && (
                                <span className="text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded uppercase hidden md:inline-block">{opp.set_aside_code}</span>
                            )}
                            {opp.response_deadline && (
                                <span className={clsx(
                                    "whitespace-nowrap font-medium hidden sm:inline",
                                    daysLeft !== null && daysLeft < 7 ? "text-red-600" :
                                        daysLeft !== null && daysLeft < 30 ? "text-amber-600" : "text-stone-500"
                                )}>
                                    {new Date(opp.response_deadline).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            {pursuedIds.has(opp.id) && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                            <button type="button" onClick={() => onToggleSave(m.id, m.is_saved)} title={m.is_saved ? "Unsave" : "Save"}
                                className={clsx("p-1 rounded",
                                    m.is_saved ? "text-amber-500" : "text-stone-400 hover:text-amber-500 hover:bg-stone-100"
                                )}>
                                <Bookmark className="w-3 h-3" fill={m.is_saved ? "currentColor" : "none"} />
                            </button>
                            <button type="button" onClick={() => onDismiss(m.id)} title="Dismiss"
                                className="p-1 rounded text-stone-400 hover:text-red-500 hover:bg-red-50">
                                <EyeOff className="w-3 h-3" />
                            </button>
                            <Link href={`/opportunities/${opp.id}`} className="p-1 rounded text-stone-400 hover:text-black">
                                <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
