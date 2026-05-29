"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * Generic collapsible content card used to break up dense settings pages
 * (1800+ lines of stacked sections into a navigable accordion).
 *
 * `storageKey` persists open/closed state to localStorage per section so
 * the user's last layout survives page reloads. `defaultOpen` decides
 * initial state on first visit.
 *
 * Title row stays sticky-tappable; arrow icon rotates 180° when open.
 */
export function CollapsibleSection({
    title,
    icon: Icon,
    children,
    storageKey,
    defaultOpen = false,
    badge,
    description,
    className,
}: {
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    storageKey?: string;
    defaultOpen?: boolean;
    badge?: React.ReactNode;
    description?: string;
    className?: string;
}) {
    // Initialize from localStorage (when storageKey provided) so the user's
    // preference survives across page reloads. SSR-safe — server renders
    // with defaultOpen and the client hydrates with the saved value.
    const [open, setOpen] = useState(defaultOpen);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (!storageKey) { setHydrated(true); return; }
        try {
            const v = localStorage.getItem(`cs:${storageKey}`);
            if (v !== null) setOpen(v === "1");
        } catch { /* localStorage blocked */ }
        setHydrated(true);
    }, [storageKey]);

    useEffect(() => {
        if (!hydrated || !storageKey) return;
        try {
            localStorage.setItem(`cs:${storageKey}`, open ? "1" : "0");
        } catch { /* ignore */ }
    }, [open, storageKey, hydrated]);

    return (
        <section
            id={storageKey}
            className={clsx(
                "bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden scroll-mt-20",
                className,
            )}
        >
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="w-full px-5 sm:px-7 py-4 flex items-center gap-3 hover:bg-stone-50 transition-colors text-left"
            >
                {Icon && <Icon className="w-5 h-5 text-stone-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base sm:text-lg text-stone-900">{title}</h3>
                        {badge}
                    </div>
                    {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
                </div>
                <ChevronDown
                    className={clsx(
                        "w-4 h-4 text-stone-400 flex-shrink-0 transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open && (
                <div className="px-5 sm:px-7 pb-5 sm:pb-7 pt-1 border-t border-stone-100">
                    {children}
                </div>
            )}
        </section>
    );
}
