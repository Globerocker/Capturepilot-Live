"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import clsx from "clsx";

/**
 * Compact badge that fetches past-award totals for a single company and
 * displays "N awards · $X total" when the company has any. Returns null
 * (nothing rendered) if the company has 0 federal awards or the lookup
 * fails — avoids cluttering list cards with unhelpful "0 awards" tags.
 *
 * Intended for partner / competitor list cards. One lightweight live call
 * per card; USASpending tolerates this fine for small lists.
 */
export function AwardCountBadge({ name, uei, className }: {
    name: string;
    uei?: string | null;
    className?: string;
}) {
    const [count, setCount] = useState<number | null>(null);
    const [value, setValue] = useState<number>(0);

    useEffect(() => {
        if (!name && !uei) return;
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({ name });
                if (uei) q.set("uei", uei);
                const res = await fetch(`/api/intelligence/recipient-awards?${q.toString()}`);
                if (!res.ok) return;
                const body = await res.json() as { summary?: { award_count?: number; total_value?: number } };
                if (!cancelled && body.summary) {
                    setCount(body.summary.award_count || 0);
                    setValue(body.summary.total_value || 0);
                }
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [name, uei]);

    if (count === null || count === 0) return null;

    const valueLabel = value >= 1_000_000_000 ? `$${(value / 1_000_000_000).toFixed(1)}B`
        : value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M`
        : value >= 1_000 ? `$${Math.round(value / 1_000)}K`
        : value > 0 ? `$${Math.round(value)}` : "";

    return (
        <span
            className={clsx(
                "inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded",
                className,
            )}
            title={`${count} federal contract awards · ${valueLabel} total (USASpending.gov)`}
        >
            <Trophy className="w-2.5 h-2.5" />
            {count}
            {valueLabel && <span className="text-amber-600 font-normal">· {valueLabel}</span>}
        </span>
    );
}
