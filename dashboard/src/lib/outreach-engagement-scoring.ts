/**
 * Outreach engagement scoring (R3-M5.1)
 *
 * Runtime counterpart to migration 150's `recompute_contact_engagement_score`
 * SQL function. Pure TS so callers (webhook handlers, the lead-score cron,
 * the contact drawer, unit tests) can compute scores without a DB round-trip,
 * AND the SQL function and this code stay in sync via the same weight table.
 *
 * Three scores:
 *   - engagement (0-100) — intent signal driven by email events
 *   - fit (0-100)        — ICP signal driven by NAICS overlap + state + revenue
 *   - composite (0-100)  — simple average; same formula as the SQL stored column
 *
 * The SQL `recompute_contact_engagement_score(p_contact_id)` is the source of
 * truth for the persisted column. This module mirrors that math so we can
 * (1) preview the score before writing, (2) sort/filter lists in memory without
 * a join, and (3) unit-test the weights.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type EngagementEventType =
    | "email_sent"
    | "email_delivered"
    | "email_opened"
    | "email_clicked"
    | "email_replied_positive"
    | "email_replied_negative"
    | "email_replied_neutral"
    | "email_bounced"
    | "email_complained"
    | "email_unsubscribed"
    | "email_opted_out"
    | "call_connected"
    | "call_voicemail"
    | "meeting_booked";

export interface EngagementEvent {
    event_type: EngagementEventType;
    captured_at?: string | Date | null;
}

export interface OutreachContactLike {
    id?: string | null;
    email?: string | null;
    naics_codes?: string[] | null;
    state?: string | null;
    opted_out_at?: string | Date | null;
    custom_fields?: Record<string, unknown> | null;
    /** Optional firmographic hints (Apollo / HubSpot sync). */
    revenue?: number | null;
    annual_revenue?: number | null;
}

/**
 * ICP config used by `calculateFitScore`. Lives on the campaign or on
 * `outreach_settings.icp` so admins can tune it without code changes; the
 * defaults below keep things sensible if no config is provided.
 */
export interface IcpConfig {
    /** NAICS the firm wants to sell to. Prefix match — "541" matches "541330". */
    target_naics?: string[];
    /** Two-letter state codes that count as in-target. Empty = nationwide. */
    target_states?: string[];
    /** Inclusive revenue band the firm sells best into (USD). */
    revenue_min?: number;
    revenue_max?: number;
    /** Weights — must sum to 1.0 conceptually but the code normalizes. */
    weights?: Partial<{
        naics: number;
        state: number;
        revenue: number;
    }>;
}

export interface CompositeLeadScore {
    engagement: number;
    fit: number;
    composite: number;
}

/* -------------------------------------------------------------------------- */
/* Weight table — KEEP IN SYNC with migration 150.                            */
/* -------------------------------------------------------------------------- */

/**
 * Per-event weights. Matches the SQL function exactly.
 *   delivered     +5
 *   opened       +10 (capped at 50)
 *   clicked      +15
 *   replied_pos  +25
 *   replied_neg  -10
 *   bounced/spam -20
 *   opt-out      → hard zero
 *
 * call_connected and meeting_booked aren't scored by the SQL function yet
 * (they're tracked for analytics). When SQL learns them we mirror.
 */
const WEIGHTS: Record<EngagementEventType, number> = {
    email_sent:              0,
    email_delivered:         5,
    email_opened:           10,
    email_clicked:          15,
    email_replied_positive: 25,
    email_replied_negative: -10,
    email_replied_neutral:   0,
    email_bounced:          -20,
    email_complained:       -20,
    email_unsubscribed:    -100, // sentinel; calculateEngagementScore short-circuits
    email_opted_out:       -100,
    call_connected:          0,
    call_voicemail:          0,
    meeting_booked:          0,
};

const OPEN_CAP = 50;

/* -------------------------------------------------------------------------- */
/* calculateEngagementScore                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Recompute the 0-100 engagement score from the event history.
 *
 * Mirrors `public.recompute_contact_engagement_score(p_contact_id)` in
 * migration 150. If the contact carries `opted_out_at`, the score is hard zero
 * regardless of prior signal — same short-circuit as the SQL function.
 */
export function calculateEngagementScore(
    contact: OutreachContactLike | null | undefined,
    recentEvents: EngagementEvent[] | null | undefined,
): number {
    if (contact?.opted_out_at) return 0;

    const events = recentEvents || [];

    let delivered = 0;
    let opened = 0;
    let clicked = 0;
    let repliedPos = 0;
    let repliedNeg = 0;
    let bounced = 0;
    let optedOut = false;

    for (const ev of events) {
        switch (ev.event_type) {
            case "email_delivered":         delivered++; break;
            case "email_opened":            opened++;    break;
            case "email_clicked":           clicked++;   break;
            case "email_replied_positive":  repliedPos++; break;
            case "email_replied_negative":  repliedNeg++; break;
            case "email_bounced":
            case "email_complained":        bounced++;   break;
            case "email_opted_out":
            case "email_unsubscribed":      optedOut = true; break;
            default: break;
        }
    }

    if (optedOut) return 0;

    const raw =
        delivered * WEIGHTS.email_delivered
        + Math.min(opened * WEIGHTS.email_opened, OPEN_CAP)
        + clicked * WEIGHTS.email_clicked
        + repliedPos * WEIGHTS.email_replied_positive
        + repliedNeg * WEIGHTS.email_replied_negative
        + bounced * WEIGHTS.email_bounced;

    return Math.max(0, Math.min(100, Math.round(raw)));
}

/* -------------------------------------------------------------------------- */
/* calculateFitScore                                                          */
/* -------------------------------------------------------------------------- */

const DEFAULT_WEIGHTS = { naics: 0.55, state: 0.20, revenue: 0.25 };

/**
 * Compute the 0-100 fit score for a contact against an ICP profile.
 *
 * Components:
 *   - NAICS overlap — prefix match between contact.naics_codes and
 *     icp.target_naics. Any overlap = full naics points (binary; this isn't
 *     graduated because most contacts only have 1-3 NAICS).
 *   - State match — contact.state ∈ icp.target_states. Empty target_states
 *     treated as "nationwide" and awards full state points.
 *   - Revenue band — contact's revenue / annual_revenue falls inside the
 *     [revenue_min, revenue_max] band. Unknown revenue awards half points so
 *     missing-data doesn't tank an otherwise good fit.
 */
export function calculateFitScore(
    contact: OutreachContactLike | null | undefined,
    icp: IcpConfig | null | undefined,
): number {
    if (!contact) return 0;
    const cfg = icp || {};
    const weights = { ...DEFAULT_WEIGHTS, ...(cfg.weights || {}) };
    const totalWeight = (weights.naics || 0) + (weights.state || 0) + (weights.revenue || 0);
    if (totalWeight <= 0) return 0;

    // NAICS overlap (prefix match).
    const targetNaics = (cfg.target_naics || []).filter(Boolean);
    const contactNaics = (contact.naics_codes || []).filter(Boolean);
    let naicsHit = 0;
    if (targetNaics.length === 0) {
        // No ICP filter → every contact matches.
        naicsHit = 1;
    } else if (contactNaics.length > 0) {
        for (const code of contactNaics) {
            if (targetNaics.some(prefix => code.startsWith(prefix))) {
                naicsHit = 1;
                break;
            }
        }
    }

    // State match.
    const targetStates = (cfg.target_states || []).map(s => s.toUpperCase());
    let stateHit = 0;
    if (targetStates.length === 0) {
        // Empty = nationwide.
        stateHit = 1;
    } else if (contact.state && targetStates.includes(contact.state.toUpperCase())) {
        stateHit = 1;
    }

    // Revenue band.
    let revenueHit = 0;
    const revenue = contact.revenue ?? contact.annual_revenue ?? null;
    if (cfg.revenue_min == null && cfg.revenue_max == null) {
        revenueHit = 1; // no band configured → ignore signal
    } else if (revenue == null) {
        revenueHit = 0.5; // unknown gets partial credit
    } else if (
        (cfg.revenue_min == null || revenue >= cfg.revenue_min)
        && (cfg.revenue_max == null || revenue <= cfg.revenue_max)
    ) {
        revenueHit = 1;
    }

    const weighted =
        weights.naics * naicsHit
        + weights.state * stateHit
        + weights.revenue * revenueHit;

    return Math.max(0, Math.min(100, Math.round((weighted / totalWeight) * 100)));
}

/* -------------------------------------------------------------------------- */
/* getCompositeLeadScore                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compose engagement + fit into one 0-100 score using the same formula
 * `outreach_lead_scores.composite` uses in migration 150
 * (`(fit_score + intent_score) / 2.0`).
 *
 * `recentEvents` is optional — when omitted, the function reads
 * `engagement_score` off the contact row directly (cheaper for list views
 * where you don't have the event history hydrated).
 */
export function getCompositeLeadScore(
    contact: OutreachContactLike & {
        engagement_score?: number | null;
        fit_score?: number | null;
    },
    opts?: {
        recentEvents?: EngagementEvent[];
        icp?: IcpConfig;
    },
): CompositeLeadScore {
    const engagement = opts?.recentEvents
        ? calculateEngagementScore(contact, opts.recentEvents)
        : Math.max(0, Math.min(100, Math.round(contact.engagement_score ?? 0)));

    const fit = opts?.icp
        ? calculateFitScore(contact, opts.icp)
        : Math.max(0, Math.min(100, Math.round(contact.fit_score ?? 0)));

    const composite = Math.round((engagement + fit) / 2);
    return { engagement, fit, composite };
}

/* -------------------------------------------------------------------------- */
/* High-intent threshold                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Engagement score above this triggers the "high-intent" Sentry alert + a
 * sales-follow-up flag in the UI. 80 chosen because reaching 80 requires
 * either a positive reply OR a click + multiple opens — both unambiguous
 * "they're interested" signals.
 */
export const HIGH_INTENT_THRESHOLD = 80;

export function isHighIntent(engagementScore: number | null | undefined): boolean {
    return (engagementScore ?? 0) >= HIGH_INTENT_THRESHOLD;
}
