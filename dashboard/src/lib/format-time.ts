/**
 * Pure-function time/duration formatters shared across the /admin/health/*
 * pages. Kept separate from display-helpers.ts (domain-specific opportunity
 * formatting) so health-page imports stay lean.
 */

/** "5s ago" / "12m ago" / "3h ago" / "2d ago" / "never". */
export function fmtRelative(ts: string | null | undefined): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 0) return "in the future";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Signed duration: "in 5m" / "in 2h" / "5m overdue". Used for next-run. */
export function fmtInterval(ms: number | null | undefined): string {
    if (ms == null) return "—";
    const abs = Math.abs(ms);
    const sign = ms < 0 ? "" : "in ";
    const suffix = ms < 0 ? " overdue" : "";
    if (abs < 60_000) return `${sign}${Math.floor(abs / 1000)}s${suffix}`;
    if (abs < 3_600_000) return `${sign}${Math.floor(abs / 60_000)}m${suffix}`;
    if (abs < 86_400_000) return `${sign}${Math.floor(abs / 3_600_000)}h${suffix}`;
    return `${sign}${Math.floor(abs / 86_400_000)}d${suffix}`;
}

/** "150ms" / "2.3s" / "1.5m". */
export function fmtMs(ms: number | null | undefined): string {
    if (ms == null) return "—";
    if (ms < 1_000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
}

/** Absolute timestamp in the browser's locale, short form. */
export function fmtAbsolute(ts: string | null | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
