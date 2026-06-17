/**
 * ICP-fit scoring — the founder's "who do I actually want to talk to" filter.
 *
 * CapturePilot's sweet spot is a small veteran-owned firm that already has a
 * handful of federal awards under its belt. Those firms are:
 *   - past the "we've never sold to the government" wall (so the platform's
 *     value is obvious to them), but
 *   - not yet big enough to have an in-house proposal team (so they still need
 *     us). 1-5 prior awards is the bullseye.
 *
 * This is intentionally NOT the match-scoring model (that's about an opp fitting
 * a profile). This is about a CONTRACTOR fitting the founder's outreach ICP. It's
 * a pure function over a contractor row so we can rank a whole list cheaply and
 * surface A/B/C tiers in the cockpit.
 *
 * Tunable weights live at the top. They sum to 100 so `score` reads as a
 * percent. Each dimension returns a 0..1 ratio that we multiply by its weight.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Tunable weights (sum to 100) ───────────────────────────────────────────
const WEIGHTS = {
    veteran: 30,        // veteran-owned is the strongest ICP signal
    disadvantaged: 20,  // 8(a)/HUBZone/WOSB — set-aside eligibility = more lanes
    employees: 20,      // 1-50 people is our band; too big = doesn't need us
    pastAwards: 30,     // 1-5 prior awards = the bullseye (see reasoning below)
} as const;

export interface IcpBreakdownItem {
    label: string;
    points: number; // points earned for this dimension (0..max)
    max: number;    // the dimension's weight
    detail: string; // human-readable why
}

export interface IcpFitResult {
    score: number; // 0..100
    breakdown: IcpBreakdownItem[];
}

/** Normalize a contractor's cert arrays into one lowercased haystack. */
function certHaystack(c: any): string {
    const a = Array.isArray(c?.certifications) ? c.certifications : [];
    const b = Array.isArray(c?.sba_certifications) ? c.sba_certifications : [];
    return [...a, ...b]
        .map((x) => (typeof x === "string" ? x : x?.type || x?.name || ""))
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();
}

// ── Veteran (weight 30) ─────────────────────────────────────────────────────
// SDVOSB is the full-credit ICP — they're the platform's archetypal user and
// the VA is the #1 SDVOSB buyer, so they have the most to gain. A plain VOSB is
// still squarely in the ICP but slightly less so (no SDVOSB set-aside access),
// hence ~0.7. We check service-disabled FIRST because an SDVOSB string usually
// also contains "veteran" — if we matched the generic pattern first we'd
// under-credit the strongest fit.
function scoreVeteran(c: any): IcpBreakdownItem {
    const hay = certHaystack(c);
    const max = WEIGHTS.veteran;
    if (/sdvosb|service.?disabled/.test(hay)) {
        return { label: "Veteran-owned", points: max, max, detail: "SDVOSB — bullseye ICP (VA is the #1 SDVOSB buyer)" };
    }
    if (/\bvosb\b|veteran/.test(hay)) {
        return { label: "Veteran-owned", points: Math.round(max * 0.7), max, detail: "VOSB — strong fit, no SDVOSB set-aside access" };
    }
    return { label: "Veteran-owned", points: 0, max, detail: "No veteran certification found" };
}

// ── Disadvantaged / 8(a) (weight 20) ─────────────────────────────────────────
// 8(a) is the prize set-aside (sole-source up to $4.5M), so an 8(a) holder gets
// full credit. HUBZone or WOSB still open dedicated set-aside lanes, so ~0.6.
// When the firm holds NONE of these AND looks small (≤50 employees or unknown),
// 8(a) certification is itself a pitch angle — we say so in the detail so the
// message writer can lead with "you're likely 8(a)-eligible and aren't using it."
function scoreDisadvantaged(c: any): IcpBreakdownItem {
    const hay = certHaystack(c);
    const max = WEIGHTS.disadvantaged;
    const has8a = /8\(a\)|\b8a\b/.test(hay);
    const hasHubzoneOrWosb = /hubzone|\bwosb\b|\bedwosb\b|women.?owned/.test(hay);
    if (has8a) {
        return { label: "Disadvantaged / 8(a)", points: max, max, detail: "8(a) certified — sole-source eligible up to $4.5M" };
    }
    if (hasHubzoneOrWosb) {
        return { label: "Disadvantaged / 8(a)", points: Math.round(max * 0.6), max, detail: "HUBZone/WOSB — set-aside eligible" };
    }
    const emp = Number(c?.employee_count || 0);
    const looksSmall = !emp || emp <= 50;
    const detail = looksSmall
        ? "No set-aside cert held — 8(a) candidate, certification is a pitch angle"
        : "No set-aside certification found";
    return { label: "Disadvantaged / 8(a)", points: 0, max, detail };
}

// ── Employees (weight 20) ─────────────────────────────────────────────────────
// 1-50 is our band — small enough to need us, established enough to bid. Above
// 50 we decay linearly to 0 by ~150 (a 150-person firm probably has BD staff and
// is out of the SMB story). NULL/0 (very common — SAM rarely publishes headcount)
// gets ~0.5: we don't KNOW they're too big, so we don't punish them like a
// known-150-person shop. Unknown is neutral, not negative.
function scoreEmployees(c: any): IcpBreakdownItem {
    const max = WEIGHTS.employees;
    const emp = Number(c?.employee_count || 0);
    if (!emp) {
        return { label: "Employees", points: Math.round(max * 0.5), max, detail: "Headcount unknown — treated as neutral" };
    }
    if (emp <= 50) {
        return { label: "Employees", points: max, max, detail: `${emp} employees — in the 1-50 sweet spot` };
    }
    if (emp >= 150) {
        return { label: "Employees", points: 0, max, detail: `${emp} employees — too large for the SMB story` };
    }
    // Linear decay from 1.0 at 50 employees down to 0 at 150.
    const ratio = 1 - (emp - 50) / 100;
    return { label: "Employees", points: Math.round(max * ratio), max, detail: `${emp} employees — above the band, declining fit` };
}

// ── Past federal awards (weight 30, the bullseye) ─────────────────────────────
// This is the dimension the founder cares about most. The shape:
//   1-5 awards  → full credit. They've crossed the "first federal sale" wall, so
//                 the platform's pipeline value is obvious, but they're early
//                 enough that they still do capture/proposal work by hand.
//   0 awards    → ~0.2. Too green. Real fit eventually, but it's a long sales
//                 cycle (they need SAM registration, set-asides, a first win),
//                 so they're not the firms we lead with.
//   6-10 awards → ~0.45 declining. Still good, but starting to build internal
//                 muscle. Linear taper from full toward the >10 floor.
//   >10 awards  → ~0.1. Likely has an in-house proposal team and incumbent
//                 positions; hardest to displace, lowest near-term ICP fit.
function scorePastAwards(c: any): IcpBreakdownItem {
    const max = WEIGHTS.pastAwards;
    const n = Number(c?.federal_awards_count || 0);
    if (n >= 1 && n <= 5) {
        return { label: "Past federal awards", points: max, max, detail: `${n} prior award(s) — bullseye, has wins but no in-house proposal team` };
    }
    if (n === 0) {
        return { label: "Past federal awards", points: Math.round(max * 0.2), max, detail: "0 awards — too green, long sales cycle" };
    }
    if (n > 10) {
        return { label: "Past federal awards", points: Math.round(max * 0.1), max, detail: `${n} awards — likely has in-house proposal team` };
    }
    // 6-10: taper from ~0.45 (at 6) down toward the >10 floor (~0.1).
    // ratio at 6 ≈ 0.45, at 10 ≈ 0.15.
    const ratio = 0.45 - ((n - 6) / 4) * 0.30;
    return { label: "Past federal awards", points: Math.round(max * ratio), max, detail: `${n} awards — building internal capability, declining fit` };
}

/**
 * Compute the ICP-fit score for a contractor row (0..100) with a per-dimension
 * breakdown. Pure — no I/O. Accepts the loose contractor shape from Supabase.
 */
export function computeIcpFit(c: any): IcpFitResult {
    const breakdown: IcpBreakdownItem[] = [
        scoreVeteran(c),
        scoreDisadvantaged(c),
        scoreEmployees(c),
        scorePastAwards(c),
    ];
    const score = breakdown.reduce((sum, b) => sum + b.points, 0);
    return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown };
}

/**
 * Bucket a 0..100 ICP score into an A/B/C tier for cockpit sorting/labels.
 *   A — ≥ 70: prioritize (veteran + bullseye-awards firms land here)
 *   B — 45-69: worth a touch
 *   C — < 45: deprioritize
 */
export function icpTier(score: number): "A" | "B" | "C" {
    if (score >= 70) return "A";
    if (score >= 45) return "B";
    return "C";
}
