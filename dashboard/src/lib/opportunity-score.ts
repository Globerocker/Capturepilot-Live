/**
 * Opportunity Score — deterministic 0-100 score for an opportunity's intrinsic
 * value, independent of any single user's match profile. Powers UI sort/filter
 * by `opportunity_score`.
 *
 * Rationale (per CLAUDE.md masterguide):
 *   - Sources Sought / RFI = highest value (6-18 months early-warning window)
 *   - Pre-solicitation = high value
 *   - Small-business preferential set-asides = boost (less competition)
 *   - Far-out deadlines = boost (time to respond); past-due = heavy penalty
 *
 * Producer: `/api/cron/backfill_opportunity_score` (orchestrator-driven).
 * Consumer: opportunities UI sort/filter, future score-based digests.
 *
 * Audit fix (2026-06-10): #9 — column existed on opportunities but no cron
 * wrote to it; 78,007/78,007 rows were NULL. This lib + the cron close that.
 */

export type ScoreInput = {
    set_aside?: string | null;
    sources_sought_flag?: boolean | null;
    notice_type?: string | null;
    /** Deadline column name on opportunities is `response_deadline`. The cron
     *  passes that value through as `deadline` to keep this function agnostic. */
    deadline?: string | null;
    agency?: string | null;
    estimated_value?: number | null;
};

export function computeOpportunityScore(o: ScoreInput): number {
    let score = 50;

    // Sources-sought is highest value: gives 6-18 months lead time before the
    // formal solicitation drops.
    if (o.sources_sought_flag) score += 20;
    if (o.notice_type === "Sources Sought" || o.notice_type === "Special Notice") score += 15;
    if (o.notice_type === "Presolicitation") score += 10;

    // Small-business set-asides cut the competition pool dramatically.
    if (o.set_aside && /SBA|8\(a\)|HUBZone|WOSB|SDVOSB|VOSB|EDWOSB/i.test(o.set_aside)) {
        score += 15;
    }

    // Deadline window — favor opps with breathing room, penalize past-due hard.
    if (o.deadline) {
        const t = new Date(o.deadline).getTime();
        if (Number.isFinite(t)) {
            const daysOut = (t - Date.now()) / 86_400_000;
            if (daysOut < 0) score -= 30;
            else if (daysOut < 7) score -= 10;
            else if (daysOut < 30) score += 0;
            else if (daysOut < 90) score += 5;
        }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
}
