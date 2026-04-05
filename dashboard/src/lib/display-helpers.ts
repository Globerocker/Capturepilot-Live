/**
 * Display helpers — translate technical terms into plain English
 * for blue-collar small business owners.
 */

// Match classification labels (DB stores HOT/WARM/COLD)
export const MATCH_LABELS: Record<string, string> = {
    HOT: "Strong Match",
    WARM: "Good Match",
    COLD: "Possible Match",
};

export const MATCH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    HOT: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    WARM: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
    COLD: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
};

// Notice type labels
export const NOTICE_TYPE_LABELS: Record<string, string> = {
    "Sources Sought": "Early Signal (Sources Sought)",
    "Presolicitation": "Upcoming Contract",
    "Solicitation": "Open for Bids",
    "Combined Synopsis/Solicitation": "Open for Bids",
    "Award Notice": "Already Awarded",
    "Forecast": "Future Opportunity",
};

// Status labels
export const STATUS_LABELS: Record<string, string> = {
    ACTIVE: "Open",
    EXPIRING_SOON: "Closing Soon",
    EXPIRED: "Closed",
    MARKET_RESEARCH: "Early Stage",
    INTELLIGENCE: "Intelligence",
    AWARDED: "Awarded",
    DISCOVERED: "New",
    SEARCH_SEED: "Future",
};

// Set-aside labels (simplified)
export function simplifySetAside(raw: string | null): string {
    if (!raw) return "Open to All";
    const lower = raw.toLowerCase();
    if (lower.includes("sdvosb") || lower.includes("service-disabled")) return "Veteran-Owned";
    if (lower.includes("vosb") || lower.includes("veteran")) return "Veteran-Owned";
    if (lower.includes("wosb") || lower.includes("women")) return "Women-Owned";
    if (lower.includes("edwosb")) return "Women-Owned";
    if (lower.includes("hubzone")) return "HUBZone";
    if (lower.includes("8(a)") || lower.includes("8a")) return "8(a) Program";
    if (lower.includes("small business") || lower.includes("sba") || lower.includes("sbp")) return "Small Business Only";
    if (lower.includes("none") || lower.includes("no set")) return "Open to All";
    return raw.length > 30 ? raw.substring(0, 27) + "..." : raw;
}

// Format currency for display
export function fmtCurrency(n: number | null | undefined): string {
    if (!n) return "";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
}

// Time ago helper
export function timeAgo(date: string | null): string {
    if (!date) return "Never";
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Days until deadline
export function daysUntil(deadline: string | null): { days: number | null; label: string; urgent: boolean } {
    if (!deadline) return { days: null, label: "No deadline", urgent: false };
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
    if (days < 0) return { days, label: "Closed", urgent: false };
    if (days === 0) return { days: 0, label: "Today!", urgent: true };
    if (days <= 3) return { days, label: `${days}d left`, urgent: true };
    if (days <= 7) return { days, label: `${days} days`, urgent: true };
    if (days <= 30) return { days, label: `${days} days`, urgent: false };
    return { days, label: `${days} days`, urgent: false };
}
