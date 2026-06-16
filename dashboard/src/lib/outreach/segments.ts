/**
 * Predefined outreach target-group segments over the `contractors` table.
 *
 * Each segment knows how to filter contractors and which seeded email template
 * it maps to. Counts + list materialization run server-side with the service
 * client (see /api/admin/outreach/segments/*). Add new segments by appending
 * to SEGMENTS — the API + UI pick them up automatically.
 *
 * NOTE on emails: most contractors have no email on file (SAM redacts POC
 * emails). `emailableFilter` narrows to rows we can actually send to; the gap
 * (total − emailable) is what the Apollo enrichment pass fills.
 */

// supabase-js query builder is loosely typed here on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Query = any;

export type SegmentKey =
    | "dormant_performers"
    | "fresh_sam"
    | "expiring_registration"
    | "set_aside_8a"
    | "vosb_sdvosb"
    | "gov_experienced"
    | "match_drop";

export interface SegmentDef {
    key: SegmentKey;
    label: string;
    description: string;
    /** Matches outreach_templates.name; null = no template seeded yet. */
    templateName: string | null;
    /** Applies the segment's filter to a supabase query on `contractors`. */
    apply: (q: Query) => Query;
}

function isoYearsAgo(n: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString();
}
function dateDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function dateDaysAhead(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

export const SEGMENTS: SegmentDef[] = [
    {
        key: "dormant_performers",
        label: "Dormant past-performers",
        description:
            "Won federal awards before, but nothing in the last 2 years. Pitch commission-based re-entry — they already have the past performance, so we just start bidding.",
        templateName: "Dormant Past-Performer — Commission Pitch",
        apply: (q) => q.gt("federal_awards_count", 0).lt("last_award_date", isoYearsAgo(2)),
    },
    {
        key: "fresh_sam",
        label: "Freshly active in SAM",
        description:
            "Recently activated in SAM.gov. Offer a free 15-minute profile review (NAICS, certs, capability statement).",
        templateName: "Fresh SAM Registration — Free Profile Review",
        apply: (q) => q.gt("activation_date", dateDaysAgo(120)),
    },
    {
        key: "expiring_registration",
        label: "SAM registration expiring soon",
        description:
            "Registration lapses within 90 days. Nudge them to renew before they fall out of the system — and offer to help.",
        templateName: "Expiring SAM · Email 1 — Renew before you lapse",
        apply: (q) =>
            q.gte("expiration_date", dateDaysAhead(0)).lte("expiration_date", dateDaysAhead(90)),
    },
    {
        key: "set_aside_8a",
        label: "8(a) certified firms",
        description:
            "Hold an active 8(a) certification — eligible for sole-source awards up to $4.5M. Lead with the sole-source advantage.",
        templateName: "8(a) · Email 1 — Sole-source advantage",
        apply: (q) => q.overlaps("sba_certifications", ["8(a)", "8A", "EIGHT_A"]),
    },
    {
        key: "vosb_sdvosb",
        label: "Veteran-owned (VOSB / SDVOSB)",
        description:
            "Veteran- or service-disabled-veteran-owned. Strong set-aside lane (esp. VA). Offer verification + capture help.",
        templateName: null,
        apply: (q) => q.overlaps("sba_certifications", ["VOSB", "SDVOSB", "VETERAN_OWNED", "SERVICE_DISABLED_VETERAN_OWNED"]),
    },
    {
        key: "gov_experienced",
        label: "Already has gov experience",
        description:
            "Their site shows federal/government past performance (QC-detected). Warm prospects who already understand the game — pitch scaling up.",
        templateName: null,
        apply: (q) => q.eq("qc_enriched", true).eq("capability_summary_ai->>has_gov_experience", "true"),
    },
    {
        key: "match_drop",
        label: "Match-Drop (3 live matches found)",
        description:
            "We ran our Quick Checker on their site and found live opportunities they can actually win, plus the gaps on their profile. Highest-intent play — lead with the 3 matches + the one thing missing from their site.",
        templateName: "Match-Drop · Email 1 — 3 matches + a gap",
        apply: (q) => q.eq("qc_enriched", true).gt("top_match_count", 0),
    },
];

/** Narrow a contractors query to rows that have an email we can send to. */
export function emailableFilter(q: Query): Query {
    return q.or("email.not.is.null,primary_poc_email.not.is.null");
}

export function getSegment(key: string): SegmentDef | undefined {
    return SEGMENTS.find((s) => s.key === key);
}
