/**
 * Source-aware metadata for the opportunity detail page.
 *
 * Federal opps from SAM.gov have a predictable URL pattern (`sam.gov/opp/<notice_id>/view`)
 * but state/county/city opps come in via the rss_sources pipeline and the
 * canonical URL is whatever was on the RSS item (`opp.link`). The detail page
 * used to hardcode SAM.gov for everything, which gave users a 404 when they
 * clicked through on a Bonfire-portal listing.
 *
 * `originalListing()` picks the right URL + label + tone given whatever shape
 * the row has. Returns null when no usable URL is available.
 */

type OppRow = {
    notice_id: string | null;
    source?: string | null;
    link?: string | null;
    agency?: string | null;
    place_of_performance_state?: string | null;
    raw_json?: unknown;
};

export type OriginalListing = {
    url: string;
    label: string;            // short button copy ("View on SAM.gov", "Open on Bonfire portal", …)
    full_label: string;       // longer phrasing for the footer CTA
    host?: string;            // raw hostname for display
    is_sam: boolean;
};

function rawProvider(opp: OppRow): string | null {
    const rj = opp.raw_json as Record<string, unknown> | undefined;
    const src = rj && typeof rj === "object" ? (rj.src as Record<string, unknown> | undefined) : undefined;
    return (src?.provider as string | undefined) || null;
}

function providerLabel(provider: string): string {
    switch (provider) {
        case "bonfire": return "Bonfire";
        case "opengov": return "OpenGov";
        case "periscope": return "Periscope";
        case "bidnet": return "BidNet";
        case "demandstar": return "DemandStar";
        case "agency_direct": return "agency portal";
        default: return provider;
    }
}

export function originalListing(opp: OppRow): OriginalListing | null {
    // 1. Federal SAM.gov — predictable URL pattern, only use it when source
    //    says SAM (or unset, since SAM was the legacy default).
    const source = (opp.source || "").toLowerCase();
    const isSam = !source || source === "sam";

    // SAM rows store the bare notice_id (no source prefix). State/local rows
    // are prefixed (e.g. "bonfire-fairfaxcounty-abc123") which would 404 on
    // sam.gov — so we check shape too.
    const looksLikeSamId = opp.notice_id && !/^[a-z]+-[a-z0-9_]+-[a-f0-9]+$/i.test(opp.notice_id);

    if (isSam && opp.notice_id && looksLikeSamId) {
        return {
            url: `https://sam.gov/opp/${opp.notice_id}/view`,
            label: "View on SAM.gov",
            full_label: "View on SAM.gov",
            host: "sam.gov",
            is_sam: true,
        };
    }

    // 2. Non-SAM — use opp.link when present (RSS ingest stores the original
    //    item link there). Label is provider-aware so "Open on Bonfire portal"
    //    reads more useful than "View Original Listing".
    if (opp.link) {
        let host: string | undefined;
        try { host = new URL(opp.link).host; } catch { /* keep undefined */ }
        const provider = rawProvider(opp);
        const providerName = provider ? providerLabel(provider) : null;
        const stateBit = opp.place_of_performance_state ? ` (${opp.place_of_performance_state})` : "";
        const agencyBit = opp.agency ? opp.agency : (providerName ? `${providerName} portal` : "original listing");
        const label = provider
            ? `Open on ${providerLabel(provider)}`
            : "Open original listing";
        const full_label = `View on ${agencyBit}${stateBit}`;
        return {
            url: opp.link,
            label,
            full_label,
            host,
            is_sam: false,
        };
    }

    // 3. Nothing usable → caller hides the button.
    return null;
}

/** Display label for the source pill (badge). Picks a state-aware label when
 *  the row came in via the RSS pipeline. */
export function sourceBadgeLabel(opp: OppRow): { label: string; tone: string } {
    const src = String(opp.source || "sam").toLowerCase();
    const provider = rawProvider(opp);
    const state = opp.place_of_performance_state;

    if (src === "sam") return { label: "Federal · SAM.gov", tone: "bg-blue-50 text-blue-700 border-blue-200" };
    if (src === "grants_gov") return { label: "Federal · Grants.gov", tone: "bg-blue-50 text-blue-700 border-blue-200" };
    if (src === "sbir") return { label: "Federal · SBIR", tone: "bg-blue-50 text-blue-700 border-blue-200" };

    // SLED — pick the most specific label possible.
    if (src === "sled" || src === "state" || src === "local") {
        const providerName = provider ? providerLabel(provider) : null;
        if (providerName && state) return { label: `${state} · ${providerName}`, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
        if (state) return { label: `${state} · State/Local`, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
        return { label: "State / Local", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }

    return { label: src.toUpperCase(), tone: "bg-stone-50 text-stone-600 border-stone-200" };
}
