"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface Props {
    /** End value (number). Counter animates from current → this. */
    value: number;
    /** Duration of the count-up animation in ms. Default 1200. */
    durationMs?: number;
    /** Format function — defaults to Intl.NumberFormat (1,234). */
    format?: (n: number) => string;
    /** Optional prefix (e.g. "$") */
    prefix?: string;
    /** Optional suffix (e.g. "+") */
    suffix?: string;
    /** Tailwind class names for the rendered <span>. */
    className?: string;
}

// Tasteful count-up counter — ease-out cubic for the last 20% of the
// animation so big numbers slow into place. SSR-safe: starts at 0 client-side
// so there's no hydration mismatch when value changes.
export function LiveCounter({ value, durationMs = 1200, format, prefix = "", suffix = "", className }: Props) {
    const [displayed, setDisplayed] = useState(0);
    const fromRef = useRef(0);
    const startRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!Number.isFinite(value)) return;
        fromRef.current = displayed;
        startRef.current = null;
        const target = value;

        const step = (ts: number) => {
            if (startRef.current === null) startRef.current = ts;
            const elapsed = ts - startRef.current;
            const t = Math.min(1, elapsed / durationMs);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            const current = Math.round(fromRef.current + (target - fromRef.current) * eased);
            setDisplayed(current);
            if (t < 1) rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, durationMs]);

    const fmt = format ?? ((n: number) => n.toLocaleString());
    return <span className={clsx("tabular-nums", className)}>{prefix}{fmt(displayed)}{suffix}</span>;
}

// Keys that /api/public/stats returns. Keep in sync with PublicStats interface
// in src/app/api/public/stats/route.ts.
export type PublicStatKey =
    | "federal_opps"
    | "sled_opps"
    | "state_opps"
    | "county_opps"
    | "city_opps"
    | "district_opps"
    | "sled_uncategorized"
    | "active_total"
    | "contractors_tracked"
    | "portals_tracked"
    | "new_today"
    | "matches_scored_24h"
    | "enrichments_completed_24h";

/**
 * Single-stat live counter — pulls from /api/public/stats once, optionally
 * re-polls. Used on the marketing landing page, the Quick Checker loading
 * screen, etc. Renders a count-up animation on first mount + every refresh.
 */
export function PublicStat({
    statKey,
    label,
    fallback = 0,
    prefix = "",
    suffix = "",
    className,
    pollMs,
}: {
    statKey: PublicStatKey;
    label?: string;
    fallback?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
    pollMs?: number;
}) {
    const [value, setValue] = useState(fallback);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch("/api/public/stats", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && typeof data[statKey] === "number") setValue(data[statKey]);
            } catch { /* swallow */ }
        }
        load();
        if (pollMs && pollMs >= 5000) {
            const t = setInterval(load, pollMs);
            return () => { cancelled = true; clearInterval(t); };
        }
        return () => { cancelled = true; };
    }, [statKey, pollMs]);

    return (
        <span className={className}>
            <LiveCounter value={value} prefix={prefix} suffix={suffix} />
            {label && <span className="ml-1 text-stone-500">{label}</span>}
        </span>
    );
}

/**
 * Reusable jurisdictional counter bar — Federal / State / County / City + Contractors.
 * Drop into any page (Quick Checker loading, marketing hero, dashboard top, email
 * preview, etc) and it will fetch + animate. Renders a 5-column grid that
 * collapses to 2 columns on mobile.
 *
 * Use `variant="compact"` for embedded contexts (smaller text, no surrounding card).
 */
export function PublicStatsBar({
    variant = "card",
    showContractors = true,
    className,
}: {
    variant?: "card" | "compact";
    showContractors?: boolean;
    className?: string;
}) {
    const compact = variant === "compact";
    const items: Array<{ key: PublicStatKey; label: string }> = [
        { key: "federal_opps", label: "Federal" },
        { key: "state_opps", label: "State" },
        { key: "county_opps", label: "County" },
        { key: "city_opps", label: "City" },
    ];
    if (showContractors) items.push({ key: "contractors_tracked", label: "Contractors" });

    const wrapClass = compact
        ? clsx("grid grid-cols-2 sm:grid-cols-5 gap-3", className)
        : clsx(
            "bg-gradient-to-r from-emerald-50 via-white to-blue-50 border border-emerald-100 rounded-2xl px-5 py-4",
            "grid grid-cols-2 sm:grid-cols-5 gap-3",
            className,
        );

    return (
        <div className={wrapClass}>
            {items.map(({ key, label }) => (
                <div key={key} className="text-center">
                    <p className={clsx("font-black text-stone-900", compact ? "text-base sm:text-lg" : "text-xl sm:text-2xl")}>
                        <PublicStat statKey={key} />
                    </p>
                    <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-0.5">{label}</p>
                </div>
            ))}
        </div>
    );
}
