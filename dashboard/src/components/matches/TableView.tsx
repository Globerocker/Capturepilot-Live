"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Settings2, Bookmark, EyeOff, CheckCircle2, X, Check, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useResizableColumns } from "@/hooks/useResizableColumns";

export interface MatchRow {
    id: string;
    score: number;
    classification: string;
    is_saved: boolean;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        naics_code: string;
        notice_type: string;
        response_deadline: string;
        set_aside_code: string;
        place_of_performance_state: string;
        award_amount: number | null;
    };
}

export interface ColumnDef {
    key: string;
    label: string;
    width?: string;
    defaultWidth: number;   // px — used by the resizer hook
    render: (m: MatchRow) => React.ReactNode;
}

const formatCurrency = (val: number | null | undefined) => {
    if (!val) return "—";
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
};

export const ALL_COLUMNS: ColumnDef[] = [
    {
        key: "score", label: "Score", defaultWidth: 80,
        render: (m) => (
            <span className={clsx(
                "inline-flex items-center justify-center font-black text-xs px-2 py-1 rounded-md border",
                m.score >= 0.70 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : m.score >= 0.50 ? "text-amber-700 bg-amber-50 border-amber-200"
                        : "text-blue-700 bg-blue-50 border-blue-200"
            )}>{Math.round(m.score * 100)}%</span>
        )
    },
    {
        key: "classification", label: "Class", defaultWidth: 96,
        render: (m) => (
            <span className={clsx(
                "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                m.classification === "HOT" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : m.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200"
                        : "bg-blue-50 text-blue-600 border-blue-200"
            )}>{m.classification === "HOT" ? "Strong" : m.classification === "WARM" ? "Good" : "Possible"}</span>
        )
    },
    {
        key: "title", label: "Title", defaultWidth: 320,
        render: (m) => (
            <Link href={`/opportunities/${m.opportunities?.id}`} className="font-bold text-black hover:underline line-clamp-2 text-xs">
                {m.opportunities?.title || "—"}
            </Link>
        )
    },
    {
        key: "agency", label: "Agency", defaultWidth: 192,
        render: (m) => <span className="text-xs text-stone-600 line-clamp-2">{m.opportunities?.agency || "—"}</span>
    },
    {
        key: "naics_code", label: "NAICS", defaultWidth: 96,
        render: (m) => <span className="font-mono text-xs text-stone-600">{m.opportunities?.naics_code || "—"}</span>
    },
    {
        key: "notice_type", label: "Notice Type", defaultWidth: 128,
        render: (m) => <span className="text-xs text-stone-600">{m.opportunities?.notice_type || "—"}</span>
    },
    {
        key: "set_aside_code", label: "Set-Aside", defaultWidth: 96,
        render: (m) => (
            m.opportunities?.set_aside_code
                ? <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded uppercase">{m.opportunities.set_aside_code}</span>
                : <span className="text-stone-300 text-xs">—</span>
        )
    },
    {
        key: "place_of_performance_state", label: "State", defaultWidth: 72,
        render: (m) => <span className="font-mono text-xs text-stone-600">{m.opportunities?.place_of_performance_state || "—"}</span>
    },
    {
        key: "award_amount", label: "Value", defaultWidth: 96,
        render: (m) => <span className="text-xs font-bold text-emerald-700">{formatCurrency(m.opportunities?.award_amount)}</span>
    },
    {
        key: "response_deadline", label: "Deadline", defaultWidth: 112,
        render: (m) => {
            const d = m.opportunities?.response_deadline;
            if (!d) return <span className="text-stone-300 text-xs">—</span>;
            const date = new Date(d);
            const daysLeft = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
                <span className={clsx(
                    "text-xs font-medium whitespace-nowrap",
                    daysLeft < 7 ? "text-red-600" : daysLeft < 30 ? "text-amber-600" : "text-stone-700"
                )}>
                    {date.toLocaleDateString()}
                    {daysLeft >= 0 && daysLeft < 60 && <span className="block text-[10px] text-stone-400">{daysLeft}d left</span>}
                </span>
            );
        }
    },
    {
        key: "saved", label: "Saved", defaultWidth: 72,
        render: (m) => m.is_saved ? <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current" /> : <span className="text-stone-300">—</span>
    },
];

export const DEFAULT_COLUMN_KEYS = ["score", "title", "agency", "naics_code", "response_deadline", "award_amount"];

export function TableView({
    matches,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    visibleColumnKeys,
    onVisibleColumnsChange,
    onToggleSave,
    onDismiss,
    pursuedIds,
    profileId,
}: {
    matches: MatchRow[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: () => void;
    visibleColumnKeys: string[];
    onVisibleColumnsChange: (keys: string[]) => void;
    onToggleSave: (id: string, saved: boolean) => void;
    onDismiss: (id: string) => void;
    pursuedIds: Set<string>;
    profileId?: string | null;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Default width map — fed to the resizable-columns hook. Stored per-profile
    // in localStorage so each user's adjustments survive reloads.
    const defaultWidths: Record<string, number> = ALL_COLUMNS.reduce((acc, c) => {
        acc[c.key] = c.defaultWidth;
        return acc;
    }, {} as Record<string, number>);

    const { getWidth, getResizerProps, reset: resetWidths } = useResizableColumns({
        storageKey: profileId ? `matches:colwidths:${profileId}` : null,
        defaults: defaultWidths,
        min: 60,
        max: 900,
    });

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
        };
        if (pickerOpen) document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [pickerOpen]);

    const visibleCols = ALL_COLUMNS.filter(c => visibleColumnKeys.includes(c.key));
    const allSelectedOnPage = matches.length > 0 && matches.every(m => selectedIds.has(m.id));

    const toggleColumn = (key: string) => {
        if (visibleColumnKeys.includes(key)) {
            if (visibleColumnKeys.length <= 1) return; // keep at least 1
            onVisibleColumnsChange(visibleColumnKeys.filter(k => k !== key));
        } else {
            onVisibleColumnsChange([...visibleColumnKeys, key]);
        }
    };

    return (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Column Picker Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-stone-200 bg-stone-50">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Table View</p>
                <div className="relative" ref={pickerRef}>
                    <button
                        type="button"
                        onClick={() => setPickerOpen(v => !v)}
                        className="text-xs font-bold text-stone-600 hover:text-black flex items-center gap-1.5 px-2 py-1 rounded hover:bg-stone-100"
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                        Columns ({visibleCols.length})
                    </button>
                    {pickerOpen && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 w-56 py-2 animate-in fade-in duration-150">
                            <div className="flex items-center justify-between px-3 pb-1 border-b border-stone-100">
                                <p className="text-[10px] uppercase text-stone-400 font-bold">Show columns</p>
                                <button type="button" onClick={() => setPickerOpen(false)} className="text-stone-400 hover:text-black">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="max-h-72 overflow-y-auto">
                                {ALL_COLUMNS.map(col => {
                                    const active = visibleColumnKeys.includes(col.key);
                                    return (
                                        <button
                                            key={col.key}
                                            type="button"
                                            onClick={() => toggleColumn(col.key)}
                                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-stone-50 text-left"
                                        >
                                            <span className={active ? "text-black font-medium" : "text-stone-500"}>{col.label}</span>
                                            {active && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="border-t border-stone-100 mt-1 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { resetWidths(); setPickerOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50 text-left"
                                >
                                    <RotateCcw className="w-3 h-3" /> Reset column widths
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="text-left" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
                    <thead>
                        <tr className="border-b border-stone-200 bg-stone-50">
                            <th className="px-3 py-2" style={{ width: 40 }}>
                                <input
                                    type="checkbox"
                                    checked={allSelectedOnPage}
                                    onChange={onToggleSelectAll}
                                    title="Select all on page"
                                    className="w-3.5 h-3.5 rounded border-stone-300 text-black focus:ring-black accent-black"
                                />
                            </th>
                            {visibleCols.map(col => (
                                <th
                                    key={col.key}
                                    className="relative text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-stone-500"
                                    style={{ width: getWidth(col.key), minWidth: getWidth(col.key), maxWidth: getWidth(col.key) }}
                                >
                                    <div className="truncate pr-2">{col.label}</div>
                                    <span
                                        {...getResizerProps(col.key)}
                                        className="group flex items-center justify-center hover:bg-stone-200/60"
                                    >
                                        <span className="w-px h-4 bg-stone-300 group-hover:bg-stone-600 transition-colors" />
                                    </span>
                                </th>
                            ))}
                            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-stone-500" style={{ width: 96 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map(m => {
                            const isSelected = selectedIds.has(m.id);
                            return (
                                <tr key={m.id} className={clsx("border-b border-stone-100 hover:bg-stone-50 transition-colors", isSelected && "bg-amber-50/30")}>
                                    <td className="px-3 py-2" style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => onToggleSelect(m.id)}
                                            className="w-3.5 h-3.5 rounded border-stone-300 text-black focus:ring-black accent-black"
                                        />
                                    </td>
                                    {visibleCols.map(col => (
                                        <td
                                            key={col.key}
                                            className="px-3 py-2 align-top overflow-hidden"
                                            style={{ width: getWidth(col.key), minWidth: getWidth(col.key), maxWidth: getWidth(col.key) }}
                                        >
                                            {col.render(m)}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2 text-right" style={{ width: 96 }}>
                                        <div className="inline-flex items-center gap-0.5">
                                            {pursuedIds.has(m.opportunities?.id) && (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                            )}
                                            <button type="button" onClick={() => onToggleSave(m.id, m.is_saved)} title={m.is_saved ? "Unsave" : "Save"}
                                                className={clsx("p-1 rounded hover:bg-stone-100",
                                                    m.is_saved ? "text-amber-500" : "text-stone-400 hover:text-amber-500"
                                                )}>
                                                <Bookmark className="w-3 h-3" fill={m.is_saved ? "currentColor" : "none"} />
                                            </button>
                                            <button type="button" onClick={() => onDismiss(m.id)} title="Dismiss"
                                                className="p-1 rounded text-stone-400 hover:text-red-500 hover:bg-red-50">
                                                <EyeOff className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
