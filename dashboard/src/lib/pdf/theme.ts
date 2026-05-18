/**
 * Design tokens for the Federal Readiness Report PDF.
 * Kept in one place so a future re-skin only touches this file.
 */

export const COLOR = {
    ink: "#0f172a",        // headings
    text: "#374151",       // body
    muted: "#6b7280",      // labels, captions
    dim: "#9ca3af",        // very subtle text
    line: "#e5e7eb",       // hairline borders
    surface: "#f8fafc",    // section backgrounds
    cardBg: "#ffffff",
    primary: "#059669",    // emerald-600 — brand accent
    primaryDark: "#047857",
    accent: "#2563eb",     // blue-600 — secondary accent
    amber: "#d97706",
    red: "#dc2626",

    // Score band colors
    scoreEmerald: "#10b981",
    scoreAmber: "#f59e0b",
    scoreRed: "#ef4444",
};

export const FONT = {
    body: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
};

export const SIZE = {
    xs: 8,
    sm: 9,
    base: 10,
    md: 11,
    lg: 13,
    xl: 16,
    xxl: 22,
    hero: 32,
};

export const PAGE = {
    padding: 40,
    contentWidth: 515, // A4 minus padding
};

export function bandColor(score: number): string {
    if (score >= 7) return COLOR.scoreEmerald;
    if (score >= 4) return COLOR.scoreAmber;
    return COLOR.scoreRed;
}

export function bandLabel(score: number): string {
    if (score >= 9) return "READY TO BID";
    if (score >= 7) return "READY TO BID";
    if (score >= 5) return "ALMOST THERE";
    if (score >= 3) return "FOUNDATION STAGE";
    return "NOT YET";
}

export function bandSub(score: number): string {
    if (score >= 9) return "Pursue prime contracts directly";
    if (score >= 7) return "Start with Sources Sought + RFIs";
    if (score >= 5) return "Fix 3 things and you're competitive";
    if (score >= 3) return "Sub-contract before going prime";
    return "Setup needed before bidding";
}

export function classColor(c: string): string {
    if (c === "HOT") return COLOR.red;
    if (c === "WARM") return COLOR.amber;
    return COLOR.accent;
}

export function fmtCurrency(amount: number): string {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

export function fmtDate(d: string | null | undefined): string {
    if (!d) return "—";
    try {
        return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return "—";
    }
}
