/**
 * Pipeline forecast — predicted close date + PWin × amount → quarterly revenue.
 *
 * Two pieces:
 *   1. inferPWin(stage, priority, opportunity) — a deterministic stand-in for
 *      the real ML PWin model. Uses pipeline-stage progression as the primary
 *      signal, refined by deadline urgency. Good enough to drive UX until we
 *      train something better; tunable in one place.
 *   2. groupByQuarter(pursuits) — bucket forecasted values into FY quarters,
 *      returning `{ quarter, weighted_total, raw_total, count }[]`.
 *
 * Everything works off `user_pursuits` rows already in the DB plus the new
 * `pwin`, `predicted_close_date`, `predicted_value_cents` columns (migration
 * 071). When pwin is explicitly set, we honor it; otherwise we infer.
 */

export interface PursuitForForecast {
    stage: string;
    priority?: string | null;
    pwin?: number | null;
    predicted_close_date?: string | null;
    predicted_value_cents?: number | null;
    opportunity?: {
        response_deadline?: string | null;
        award_amount?: number | null;
        estimated_value?: number | null;
        notice_type?: string | null;
    } | null;
}

// Base PWin by stage. Anchored against the standard B2G capture lifecycle:
// once you've actually submitted a proposal, win probability jumps; once
// you've been notified, it's basically a coin flip until award.
const STAGE_BASE: Record<string, number> = {
    discovered: 5,
    researching: 10,
    preparing: 20,
    submitted: 35,
    awarded: 100,
    lost: 0,
    no_bid: 0,
};

const PRIORITY_BUMP: Record<string, number> = {
    high: 10,
    medium: 0,
    low: -5,
};

export function inferPWin(p: PursuitForForecast): number {
    if (typeof p.pwin === "number") return Math.max(0, Math.min(100, p.pwin));

    let pwin = STAGE_BASE[p.stage] ?? 5;
    pwin += PRIORITY_BUMP[p.priority || "medium"] || 0;

    // Sources Sought / RFI pursuits get a nudge — early engagement is a
    // real win-rate signal in B2G capture per the docs in CLAUDE.md.
    const nt = (p.opportunity?.notice_type || "").toLowerCase();
    if (nt.includes("sources sought") || nt.includes("rfi")) pwin += 5;

    // Deadline proximity penalty — if the response is due in <3 days and
    // we're still in "researching", probably not going to happen.
    if (p.opportunity?.response_deadline) {
        const ms = new Date(p.opportunity.response_deadline).getTime() - Date.now();
        const days = ms / 86400_000;
        if (days < 3 && p.stage !== "submitted") pwin -= 15;
        if (days < 0 && p.stage !== "submitted") pwin -= 25;
    }
    return Math.max(0, Math.min(100, Math.round(pwin)));
}

export function inferValueCents(p: PursuitForForecast): number {
    if (typeof p.predicted_value_cents === "number") return p.predicted_value_cents;
    const award = p.opportunity?.award_amount;
    const est = p.opportunity?.estimated_value;
    const usd = (typeof award === "number" && award > 0) ? award : (typeof est === "number" ? est : 0);
    return Math.round(usd * 100);
}

export function inferCloseDate(p: PursuitForForecast): string | null {
    if (p.predicted_close_date) return p.predicted_close_date;
    // Submitted pursuits typically award ~90 days after the response deadline.
    // Earlier-stage pursuits get a longer horizon.
    const deadline = p.opportunity?.response_deadline;
    if (!deadline) return null;
    const offsetDays = p.stage === "submitted" ? 90
        : p.stage === "preparing" ? 120
        : p.stage === "researching" ? 180
        : 210;
    return new Date(new Date(deadline).getTime() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

// US federal fiscal year — Oct 1 to Sep 30. Q1 = Oct-Dec, Q2 = Jan-Mar, etc.
export function fiscalQuarter(dateStr: string): { fy: number; q: 1 | 2 | 3 | 4; label: string } {
    const d = new Date(dateStr);
    const m = d.getMonth(); // 0=Jan
    const y = d.getFullYear();
    let fy: number, q: 1 | 2 | 3 | 4;
    if (m >= 9) { fy = y + 1; q = 1; }
    else if (m >= 6) { fy = y; q = 4; }
    else if (m >= 3) { fy = y; q = 3; }
    else { fy = y; q = 2; }
    return { fy, q, label: `FY${String(fy).slice(2)} Q${q}` };
}

export interface QuarterForecast {
    label: string;
    fy: number;
    q: 1 | 2 | 3 | 4;
    weighted_cents: number;
    raw_cents: number;
    pursuits: number;
}

export function groupByQuarter(pursuits: PursuitForForecast[]): QuarterForecast[] {
    const byKey = new Map<string, QuarterForecast>();
    for (const p of pursuits) {
        // Skip terminal pursuits for forecasting — they're history, not pipeline.
        if (p.stage === "awarded" || p.stage === "lost" || p.stage === "no_bid") continue;
        const closeDate = inferCloseDate(p);
        if (!closeDate) continue;
        const valueCents = inferValueCents(p);
        if (valueCents <= 0) continue;
        const pwin = inferPWin(p);
        const { fy, q, label } = fiscalQuarter(closeDate);
        const key = `${fy}-${q}`;
        const entry = byKey.get(key) || { label, fy, q, weighted_cents: 0, raw_cents: 0, pursuits: 0 };
        entry.weighted_cents += Math.round(valueCents * pwin / 100);
        entry.raw_cents += valueCents;
        entry.pursuits += 1;
        byKey.set(key, entry);
    }
    return Array.from(byKey.values()).sort((a, b) => a.fy === b.fy ? a.q - b.q : a.fy - b.fy);
}
