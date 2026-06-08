"use client";

import { useEffect } from "react";
import clsx from "clsx";
import { X } from "lucide-react";

/**
 * SampleDrawer — right-side slide-out used by /admin/health/* pages to
 * surface "sample N rows" / "raw JSON" / "recent objects" without leaving
 * the current page. Closes on backdrop click and Esc.
 *
 * Intentionally not a full modal — keeps the parent context visible on the
 * left so the admin can flip between samples and the aggregate view.
 */
export function SampleDrawer({
    open,
    onClose,
    title,
    subtitle,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: React.ReactNode;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
            />
            <aside
                className={clsx(
                    "fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[560px] bg-white shadow-2xl flex flex-col",
                    "border-l border-stone-200",
                )}
            >
                <header className="flex items-start justify-between gap-3 p-5 border-b border-stone-100">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-bold text-stone-900 truncate">{title}</h2>
                        {subtitle && <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-stone-400 hover:text-stone-700 p-1 -mr-1"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto p-5">
                    {children}
                </div>
            </aside>
        </>
    );
}
