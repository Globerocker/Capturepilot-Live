"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkPlus, Bell, BellOff, Loader2, Trash2, ChevronDown, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface SavedSearch {
    id: string;
    name: string;
    filters: Record<string, unknown>;
    alert_enabled: boolean;
    last_alert_at: string | null;
    new_match_count: number;
    created_at: string;
}

interface Props {
    /** Current filter state from the matches page, opaque to this component. */
    currentFilters: Record<string, unknown>;
    /** Called when the user picks a saved search to load. */
    onApply: (filters: Record<string, unknown>) => void;
}

/**
 * Saved-searches dropdown for /matches. Lets the user:
 *   1. Save the current filter combo (POST → /api/saved-searches)
 *   2. Load a saved search (replaces filter state via onApply)
 *   3. Toggle the daily-email alert per-search
 *   4. Delete a saved search
 *
 * Plan-tier gate is enforced server-side (402 with plan_limit). On 402 we
 * surface a "upgrade your plan" CTA inline rather than a generic error.
 */
export function SavedSearchesMenu({ currentFilters, onApply }: Props) {
    const [open, setOpen] = useState(false);
    const [searches, setSearches] = useState<SavedSearch[] | null>(null);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [limitInfo, setLimitInfo] = useState<{ limit: number; tier: string } | null>(null);

    const load = async () => {
        try {
            const res = await fetch("/api/saved-searches", { cache: "no-store" });
            if (!res.ok) {
                setSearches([]);
                return;
            }
            const body = await res.json();
            setSearches(body.searches || []);
        } catch {
            setSearches([]);
        }
    };

    useEffect(() => {
        if (open && searches === null) load();
    }, [open]);

    const onSave = async () => {
        setSaving(true);
        setErrorMsg(null);
        setLimitInfo(null);
        const defaultName = `Search · ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
        const name = window.prompt("Name this saved search:", defaultName);
        if (!name) {
            setSaving(false);
            return;
        }
        try {
            const res = await fetch("/api/saved-searches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), filters: currentFilters }),
            });
            const body = await res.json();
            if (res.status === 402) {
                setErrorMsg(body.message);
                setLimitInfo({ limit: body.limit, tier: body.tier });
            } else if (!res.ok) {
                setErrorMsg(body.error || `HTTP ${res.status}`);
            } else {
                setSearches(prev => prev ? [body.search, ...prev] : [body.search]);
            }
        } catch (e) {
            setErrorMsg((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const onToggleAlert = async (s: SavedSearch) => {
        const next = !s.alert_enabled;
        setSearches(prev => prev ? prev.map(x => x.id === s.id ? { ...x, alert_enabled: next } : x) : prev);
        await fetch(`/api/saved-searches?id=${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alert_enabled: next }),
        });
    };

    const onDelete = async (s: SavedSearch) => {
        if (!confirm(`Delete "${s.name}"?`)) return;
        setSearches(prev => prev ? prev.filter(x => x.id !== s.id) : prev);
        await fetch(`/api/saved-searches?id=${s.id}`, { method: "DELETE" });
    };

    return (
        <div className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-white border border-stone-200 hover:border-stone-300 px-3 py-1.5 rounded-full"
            >
                <Bookmark className="w-3.5 h-3.5" />
                Saved searches
                <ChevronDown className={clsx("w-3 h-3 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                    {/* Save current filters */}
                    <div className="p-3 border-b border-stone-100">
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={saving}
                            className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                            Save current filters
                        </button>
                        {errorMsg && (
                            <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5 flex items-start gap-1.5">
                                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    {errorMsg}
                                    {limitInfo && (
                                        <Link href="/pricing" className="block mt-1 font-bold text-rose-800 underline">
                                            Upgrade from {limitInfo.tier} →
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Existing searches */}
                    <div className="max-h-72 overflow-y-auto">
                        {searches === null ? (
                            <div className="p-4 text-xs text-stone-500 flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                            </div>
                        ) : searches.length === 0 ? (
                            <div className="p-4 text-xs text-stone-500">
                                No saved searches yet. Save the filters above to get a daily email when new opps match.
                            </div>
                        ) : (
                            searches.map(s => (
                                <div key={s.id} className="border-b border-stone-50 last:border-0 px-3 py-2 hover:bg-stone-50 group">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { onApply(s.filters); setOpen(false); }}
                                            className="flex-1 text-left min-w-0"
                                        >
                                            <p className="text-xs font-bold text-stone-900 truncate">{s.name}</p>
                                            <p className="text-[10px] text-stone-400">
                                                {s.last_alert_at
                                                    ? `Last alert ${new Date(s.last_alert_at).toLocaleDateString()}`
                                                    : "No alerts sent yet"}
                                                {s.new_match_count > 0 && (
                                                    <span className="ml-1 text-emerald-700 font-bold">· +{s.new_match_count} new</span>
                                                )}
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onToggleAlert(s)}
                                            title={s.alert_enabled ? "Daily alert ON — click to mute" : "Click to enable daily alerts"}
                                            className={clsx(
                                                "p-1.5 rounded transition-colors flex-shrink-0",
                                                s.alert_enabled ? "text-emerald-600 hover:bg-emerald-50" : "text-stone-300 hover:text-stone-500 hover:bg-stone-100",
                                            )}
                                        >
                                            {s.alert_enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(s)}
                                            title="Delete"
                                            className="p-1.5 rounded text-stone-300 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-shrink-0"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
