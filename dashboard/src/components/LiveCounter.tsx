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

/**
 * StatsBadge — pull from /api/public/stats once, optionally re-poll. Used
 * on the marketing landing page, the Quick Checker loading screen, etc.
 * Renders a count-up animation on first mount + every refresh.
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
    statKey: "federal_opps" | "sled_opps" | "active_total" | "contractors_tracked" | "portals_tracked" | "new_today" | "matches_scored_24h" | "enrichments_completed_24h";
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
