"use client";

import { useEffect, useState } from "react";
import { X, Settings2, Eye, EyeOff, CheckCircle2, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import clsx from "clsx";
import { WIDGETS, type DashboardLayout, type DashboardWidgetId } from "@/lib/dashboard-layout";

/**
 * Floating "Customize" button + slide-over drawer.
 * Lets the user toggle individual dashboard widgets + reorder them.
 * Changes persist to user_profiles.notes.dashboard_layout via
 * POST /api/user/dashboard-layout.
 */
export default function DashboardCustomizer({
    initialLayout,
    onLayoutChange,
}: {
    initialLayout: DashboardLayout;
    onLayoutChange: (layout: DashboardLayout) => void;
}) {
    const [open, setOpen] = useState(false);
    const [hidden, setHidden] = useState<Set<DashboardWidgetId>>(new Set(initialLayout.hidden || []));
    const [order, setOrder] = useState<DashboardWidgetId[]>(
        (initialLayout.order && initialLayout.order.length > 0)
            ? [...initialLayout.order, ...WIDGETS.map(w => w.id).filter(id => !initialLayout.order!.includes(id))]
            : WIDGETS.map(w => w.id),
    );
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setHidden(new Set(initialLayout.hidden || []));
        setOrder((initialLayout.order && initialLayout.order.length > 0)
            ? [...initialLayout.order, ...WIDGETS.map(w => w.id).filter(id => !initialLayout.order!.includes(id))]
            : WIDGETS.map(w => w.id),
        );
    }, [initialLayout]);

    const toggle = (id: DashboardWidgetId) => {
        const next = new Set(hidden);
        if (next.has(id)) next.delete(id); else next.add(id);
        setHidden(next);
    };

    const move = (id: DashboardWidgetId, delta: -1 | 1) => {
        setOrder((prev) => {
            const idx = prev.indexOf(id);
            if (idx < 0) return prev;
            const next = [...prev];
            const swapIdx = idx + delta;
            if (swapIdx < 0 || swapIdx >= next.length) return prev;
            [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const payload = { hidden: [...hidden], order };
            const res = await fetch("/api/user/dashboard-layout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await res.text());
            onLayoutChange(payload);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
        } catch {
            /* swallow — indicator will just not flash */
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        setHidden(new Set());
        setOrder(WIDGETS.map(w => w.id));
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors"
            >
                <Settings2 className="w-3.5 h-3.5" />
                Customize
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                        onClick={() => setOpen(false)}
                    />
                    <div className="fixed top-0 right-0 bottom-0 w-full sm:w-96 bg-white z-50 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
                        <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-stone-100 px-5 py-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-stone-900">Customize dashboard</h2>
                                <p className="text-[11px] text-stone-500 mt-0.5">Toggle widgets + drag to reorder.</p>
                            </div>
                            <button type="button" onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-3 space-y-2">
                            {order.map((id, i) => {
                                const w = WIDGETS.find(w => w.id === id);
                                if (!w) return null;
                                const isHidden = hidden.has(id);
                                return (
                                    <div
                                        key={id}
                                        className={clsx(
                                            "group flex items-start gap-2 p-3 rounded-xl border transition-colors",
                                            isHidden
                                                ? "bg-stone-50 border-stone-200 opacity-60"
                                                : "bg-white border-stone-200 hover:border-stone-300",
                                        )}
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => move(id, -1)}
                                                disabled={i === 0}
                                                title="Move up"
                                                className="w-5 h-5 rounded flex items-center justify-center text-stone-400 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
                                            >
                                                <ArrowUp className="w-3 h-3" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => move(id, 1)}
                                                disabled={i === order.length - 1}
                                                title="Move down"
                                                className="w-5 h-5 rounded flex items-center justify-center text-stone-400 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
                                            >
                                                <ArrowDown className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={clsx("text-sm font-semibold", isHidden ? "text-stone-400 line-through" : "text-stone-900")}>
                                                {w.label}
                                            </p>
                                            <p className="text-[11px] text-stone-500 mt-0.5 leading-tight">{w.description}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => toggle(id)}
                                            title={isHidden ? "Show" : "Hide"}
                                            className={clsx(
                                                "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                                isHidden ? "bg-stone-200 text-stone-500 hover:bg-stone-300" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                                            )}
                                        >
                                            {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-stone-100 px-5 py-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={reset}
                                className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
                            >
                                Reset to default
                            </button>
                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-black text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3" /> : null}
                                    {saving ? "Saving…" : saved ? "Saved" : "Save layout"}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
