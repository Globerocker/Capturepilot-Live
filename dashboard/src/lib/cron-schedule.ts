/**
 * Cron-schedule helpers for the /admin/health/crons telemetry pages.
 *
 * Reads the canonical schedule out of dashboard/vercel.json at build time so
 * the admin UI never falls out of sync with what Vercel actually runs.
 *
 * Also exposes a tiny human-readable + next-run calculator. We intentionally
 * avoid pulling in cron-parser/cronstrue (extra runtime weight) since our
 * needs are narrow and the cron expressions in vercel.json are all simple
 * 5-field POSIX form.
 */
import vercelJson from "../../vercel.json";

export interface CronDef {
    path: string;
    schedule: string;
}

export function getAllCrons(): CronDef[] {
    const raw = (vercelJson as { crons?: CronDef[] }).crons || [];
    return raw.map(c => ({ path: c.path, schedule: c.schedule }));
}

export function findCron(route: string): CronDef | null {
    return getAllCrons().find(c => c.path === route) || null;
}

/** Convert a cron field like "0,5,10" / "*" / "*​/5" / "1-5" to a set of allowed values. */
function expandField(field: string, min: number, max: number): number[] {
    const out = new Set<number>();
    for (const part of field.split(",")) {
        // Step values: */5, 1-30/2
        const stepMatch = part.match(/^(.*)\/(\d+)$/);
        const stepRaw = stepMatch ? stepMatch[1] : part;
        const step = stepMatch ? parseInt(stepMatch[2]!, 10) : 1;

        let lo = min;
        let hi = max;
        if (stepRaw === "*" || stepRaw === "") {
            // keep min..max
        } else if (stepRaw.includes("-")) {
            const [a, b] = stepRaw.split("-").map(s => parseInt(s, 10));
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            lo = a!;
            hi = b!;
        } else {
            const n = parseInt(stepRaw, 10);
            if (!Number.isFinite(n)) continue;
            lo = hi = n;
        }
        for (let v = lo; v <= hi; v += step) {
            if (v >= min && v <= max) out.add(v);
        }
    }
    return [...out].sort((a, b) => a - b);
}

/**
 * Compute the next run time for a cron expression starting from `from` (UTC).
 * Returns null if the expression is malformed or we can't find one within
 * a reasonable horizon (a year out).
 */
export function nextRunAt(schedule: string, from: Date = new Date()): Date | null {
    const fields = schedule.trim().split(/\s+/);
    if (fields.length !== 5) return null;
    const [minF, hourF, domF, monF, dowF] = fields;
    let mins: number[], hours: number[], doms: number[], months: number[], dows: number[];
    try {
        mins = expandField(minF!, 0, 59);
        hours = expandField(hourF!, 0, 23);
        doms = expandField(domF!, 1, 31);
        months = expandField(monF!, 1, 12);
        dows = expandField(dowF!, 0, 6);
    } catch {
        return null;
    }
    if (!mins.length || !hours.length || !doms.length || !months.length || !dows.length) return null;

    // Walk minute-by-minute from `from` until we hit a match. Capped at 525,600
    // iterations (1 year). vercel cron only goes down to minute granularity.
    const d = new Date(from.getTime());
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(d.getUTCMinutes() + 1); // strictly after `from`
    for (let i = 0; i < 525_600; i++) {
        const mm = d.getUTCMinutes();
        const hh = d.getUTCHours();
        const dom = d.getUTCDate();
        const mon = d.getUTCMonth() + 1;
        const dow = d.getUTCDay(); // 0=Sun

        if (
            mins.includes(mm) &&
            hours.includes(hh) &&
            months.includes(mon) &&
            // Per POSIX, when both day-of-month and day-of-week are restricted
            // it's an OR. Vercel docs follow POSIX.
            (
                (domF === "*" || dowF === "*")
                    ? (doms.includes(dom) && dows.includes(dow))
                    : (doms.includes(dom) || dows.includes(dow))
            )
        ) {
            return d;
        }
        d.setUTCMinutes(d.getUTCMinutes() + 1);
    }
    return null;
}

/**
 * Estimate the expected interval (milliseconds) between consecutive runs of
 * a cron. Used by the status badge to decide if "last run" is stale.
 *
 * Strategy: compute two consecutive future fire times and take the delta.
 * Simple and accurate enough for the dashboard.
 */
export function expectedIntervalMs(schedule: string): number | null {
    const first = nextRunAt(schedule);
    if (!first) return null;
    const second = nextRunAt(schedule, first);
    if (!second) return null;
    return second.getTime() - first.getTime();
}

/**
 * Lossy "humanize" — keeps things short for chips/badges. We map common
 * patterns explicitly and fall through to a raw `cron(<expr>)` label.
 */
export function humanizeSchedule(schedule: string): string {
    const fields = schedule.trim().split(/\s+/);
    if (fields.length !== 5) return schedule;
    const [m, h, dom, mon, dow] = fields;
    // Daily at HH:MM
    if (dom === "*" && mon === "*" && dow === "*" && !m!.includes("*") && !h!.includes("*") && !m!.includes("/")) {
        return `Daily at ${h!.padStart(2, "0")}:${m!.padStart(2, "0")} UTC`;
    }
    // Every N minutes
    const stepMin = m!.match(/^\*\/(\d+)$/);
    if (stepMin && h === "*" && dom === "*" && mon === "*" && dow === "*") {
        return `Every ${stepMin[1]} min`;
    }
    // Hourly at MM
    if (h === "*" && dom === "*" && mon === "*" && dow === "*" && !m!.includes("*") && !m!.includes("/")) {
        return `Hourly at :${m!.padStart(2, "0")}`;
    }
    // Every N hours
    const stepHour = h!.match(/^\*\/(\d+)$/);
    if (stepHour && dom === "*" && mon === "*" && dow === "*") {
        return `Every ${stepHour[1]}h at :${m!.padStart(2, "0")}`;
    }
    // Specific weekday(s)
    const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    if (dow !== "*" && dom === "*" && mon === "*" && !m!.includes("*") && !h!.includes("*")) {
        const days = expandField(dow!, 0, 6).map(d => dowNames[d]).join(",");
        return `${days} at ${h!.padStart(2, "0")}:${m!.padStart(2, "0")} UTC`;
    }
    // Monthly
    if (dom !== "*" && dow === "*" && !dom!.includes("*")) {
        return `Day ${dom} of month at ${h!.padStart(2, "0")}:${m!.padStart(2, "0")} UTC`;
    }
    return `cron(${schedule})`;
}
