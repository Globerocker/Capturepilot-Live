/**
 * Outreach deliverability guards.
 *
 * Three checks the cadence runner (R3-M2.1) calls BEFORE handing a message
 * to the send provider:
 *
 *   spamScore(subject, body)
 *     - returns 0-100 + reasons[]. Block + log if > 60.
 *
 *   bestSendTime(contact, defaultTimezone, campaign?, throttle?)
 *     - returns the next valid TIMESTAMPTZ-compatible Date honoring the
 *       contact timezone, campaign send window, weekday-vs-weekend, and a
 *       basic US holiday list. Used to delay sends 1-12h when the current
 *       moment is outside window.
 *
 *   throttleCheck(campaignId, sendsLastHour, throttle?)
 *     - returns { allow, delayMinutes, reason } indicating whether to pause
 *       + reschedule when the campaign has hit its hourly cap.
 *
 * All three are pure functions of their inputs (the throttle check takes
 * the sends-last-hour count from the caller, who knows how to query it).
 * That lets the cadence runner unit-test them and lets the spam-check API
 * route call spamScore without any DB roundtrip.
 */

import {
  SPAM_TRIGGER_WORDS,
  SUBJECT_RED_FLAGS,
  bodyStructuralRules,
  type SpamCategory,
} from "./outreach-spam-words";

// ---------------------------------------------------------------------------
// Spam scoring
// ---------------------------------------------------------------------------

export interface SpamCheckReason {
  category: SpamCategory | "subject" | "structure";
  reason: string;
  weight: number;
}

export interface SpamCheckResult {
  /** 0-100 */
  score: number;
  /** Per-rule hits. */
  reasons: SpamCheckReason[];
  /** True when score >= 60 — caller should block. */
  block: boolean;
  /** True when score >= 35 — caller may warn but still send. */
  warn: boolean;
}

const BLOCK_THRESHOLD = 60;
const WARN_THRESHOLD = 35;

/**
 * Compile a single regex per word for performance. We anchor on word
 * boundaries — \b doesn't work for phrases with spaces inside, so we use
 * lookarounds for non-word chars instead.
 */
function buildWordPattern(word: string): RegExp {
  // Escape regex metacharacters first.
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?<![A-Za-z0-9]) + (?![A-Za-z0-9]) approximates whole-word match for
  // phrases ("free money" should match "FREE MONEY!" but not "freedom moneys").
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
}

const SPAM_PATTERNS = SPAM_TRIGGER_WORDS.map((w) => ({
  ...w,
  pattern: buildWordPattern(w.word),
}));

export function spamScore(subject: string, body: string): SpamCheckResult {
  const reasons: SpamCheckReason[] = [];
  let score = 0;

  const safeSubject = (subject || "").trim();
  const safeBody = (body || "").trim();
  const combined = `${safeSubject}\n${safeBody}`;

  // 1. word-level triggers across subject + body
  const seen = new Set<string>();
  for (const w of SPAM_PATTERNS) {
    if (seen.has(w.word)) continue;
    if (w.pattern.test(combined)) {
      seen.add(w.word);
      score += w.weight;
      reasons.push({
        category: w.category,
        reason: `Spam trigger word: "${w.word}"`,
        weight: w.weight,
      });
    }
  }

  // 2. subject-line specific red flags
  if (safeSubject) {
    for (const flag of SUBJECT_RED_FLAGS) {
      if (flag.pattern.test(safeSubject)) {
        score += flag.weight;
        reasons.push({
          category: "subject",
          reason: flag.reason,
          weight: flag.weight,
        });
      }
    }
    // subject all-caps
    const letters = safeSubject.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 6 && letters === letters.toUpperCase()) {
      score += 8;
      reasons.push({
        category: "subject",
        reason: "Subject is ALL CAPS",
        weight: 8,
      });
    }
    // overlong subject
    if (safeSubject.length > 110) {
      score += 4;
      reasons.push({
        category: "subject",
        reason: `Subject is ${safeSubject.length} chars — keep under 70`,
        weight: 4,
      });
    }
    // missing subject
  } else {
    score += 15;
    reasons.push({
      category: "subject",
      reason: "Subject line is empty",
      weight: 15,
    });
  }

  // 3. body structural rules
  for (const hit of bodyStructuralRules(safeBody)) {
    score += hit.weight;
    reasons.push({
      category: "structure",
      reason: hit.reason,
      weight: hit.weight,
    });
  }

  const capped = Math.max(0, Math.min(100, Math.round(score)));
  reasons.sort((a, b) => b.weight - a.weight);

  return {
    score: capped,
    reasons,
    block: capped >= BLOCK_THRESHOLD,
    warn: capped >= WARN_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Send-time windowing
// ---------------------------------------------------------------------------

/**
 * Campaign throttle shape — matches the JSONB column on outreach_campaigns
 * (migration 148). The cadence runner reads it from the row directly.
 */
export interface CampaignThrottle {
  sends_per_hour?: number;
  send_window_start?: string;   // "HH:MM"
  send_window_end?: string;     // "HH:MM"
  timezone?: string;            // IANA TZ identifier, e.g. "America/New_York"
  send_on_weekends?: boolean;
  send_on_holidays?: boolean;
}

export interface ContactLike {
  timezone?: string | null;
  state?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

const DEFAULT_WINDOW_START = "09:00";
const DEFAULT_WINDOW_END = "17:00";
const DEFAULT_TZ = "America/New_York";

/** Parse "HH:MM" into [h, m] integers. Falls back to [9, 0] on bad input. */
function parseHHMM(value: string | undefined, fallback: [number, number]): [number, number] {
  if (!value) return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return fallback;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return [h, mm];
}

/**
 * Compute the year/month/day/hour/minute/weekday a Date represents in a
 * specific IANA timezone. Using Intl.DateTimeFormat is the cheapest way
 * that doesn't pull a TZ library; it's accurate including DST transitions.
 */
function getTzParts(d: Date, tz: string): {
  year: number;
  month: number;   // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun, 6 = Sat
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "00" : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 1,
  };
}

/**
 * Given local Y/M/D/H/M in a target timezone, return the matching UTC Date.
 * Binary-search against Intl to land on the right wall-clock instant in spite
 * of DST.
 */
function dateFromTzLocal(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // First guess: pretend the wall-clock time is UTC, then shift by the
  // current offset for that instant.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = getTzParts(guess, tz);
  // Diff in minutes between what we got and what we wanted.
  const wantedMin =
    year * 525600 + month * 43200 + day * 1440 + hour * 60 + minute;
  const gotMin =
    parts.year * 525600 + parts.month * 43200 + parts.day * 1440 +
    parts.hour * 60 + parts.minute;
  const deltaMs = (wantedMin - gotMin) * 60_000;
  return new Date(guess.getTime() + deltaMs);
}

/**
 * Basic US federal holiday list. We can't predict floating dates years out
 * without a library, so we hard-code 2026/2027 — anything beyond is treated
 * as a non-holiday (the cadence runner will fall through to the weekday/
 * window rules, which is fine, just less polite).
 */
const US_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // New Year's
  "2026-01-19", // MLK
  "2026-02-16", // Presidents Day
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // July 4 observed (Sat)
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving
  "2026-11-27", // Day after Thanksgiving (commonly observed)
  "2026-12-24", // Christmas Eve (commonly observed)
  "2026-12-25", // Christmas
  "2026-12-31", // New Year's Eve (commonly observed)
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-05-31",
  "2027-06-18", // Juneteenth observed (Fri before Sat)
  "2027-07-05", // July 4 observed (Sun)
  "2027-09-06",
  "2027-10-11",
  "2027-11-11",
  "2027-11-25",
  "2027-11-26",
  "2027-12-24",
  "2027-12-25",
]);

function isHoliday(year: number, month: number, day: number): boolean {
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return US_HOLIDAYS.has(key);
}

/** Map a US state code to an IANA timezone. Coarse but good enough. */
const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix",
  AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York", DE: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise",
  IL: "America/Chicago", IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York",
  LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver",
  NE: "America/Chicago", NV: "America/Los_Angeles",
  NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago",
  OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles",
  PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VT: "America/New_York", VA: "America/New_York",
  WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago",
  WY: "America/Denver", DC: "America/New_York", PR: "America/Puerto_Rico",
  VI: "America/St_Thomas", GU: "Pacific/Guam",
};

/** Pick the best timezone for a contact, falling back through state → default. */
export function resolveContactTimezone(
  contact: ContactLike,
  defaultTimezone = DEFAULT_TZ,
): string {
  if (contact.timezone) return contact.timezone;
  if (contact.state) {
    const code = contact.state.trim().toUpperCase();
    if (STATE_TZ[code]) return STATE_TZ[code];
  }
  const tzCustom = contact.custom_fields?.timezone;
  if (typeof tzCustom === "string" && tzCustom.trim()) return tzCustom.trim();
  return defaultTimezone;
}

export interface BestSendTimeOptions {
  /** When omitted, "now" is used. Useful for tests. */
  now?: Date;
  /** Override timezone (cadence runner may pass campaign sender TZ). */
  timezone?: string;
}

/**
 * Compute the next instant at which the cadence runner can ship the message.
 * Honors:
 *   - contact-resolved timezone
 *   - campaign send window (default 09:00-17:00)
 *   - weekday rule (skip Sat/Sun unless throttle.send_on_weekends)
 *   - US federal holidays (skip unless throttle.send_on_holidays)
 *   - earliest allowed: 1 minute from now (i.e. "send asap" stays asap)
 *
 * Returns a Date — caller stores as TIMESTAMPTZ on
 * outreach_campaign_contacts.next_send_at.
 */
export function bestSendTime(
  contact: ContactLike,
  defaultTimezone = DEFAULT_TZ,
  throttle?: CampaignThrottle,
  opts: BestSendTimeOptions = {},
): Date {
  const now = opts.now ?? new Date();
  const tz = opts.timezone ?? resolveContactTimezone(contact, defaultTimezone);

  const [winStartH, winStartM] = parseHHMM(
    throttle?.send_window_start,
    parseHHMM(DEFAULT_WINDOW_START, [9, 0]),
  );
  const [winEndH, winEndM] = parseHHMM(
    throttle?.send_window_end,
    parseHHMM(DEFAULT_WINDOW_END, [17, 0]),
  );

  const sendWeekends = throttle?.send_on_weekends === true;
  const sendHolidays = throttle?.send_on_holidays === true;

  // Walk forward up to 14 days finding a valid send slot.
  const earliest = new Date(now.getTime() + 60_000); // +1min
  let cursor = new Date(earliest);

  for (let i = 0; i < 14; i++) {
    const parts = getTzParts(cursor, tz);
    const dayOk =
      (sendWeekends || (parts.weekday !== 0 && parts.weekday !== 6)) &&
      (sendHolidays || !isHoliday(parts.year, parts.month, parts.day));

    if (dayOk) {
      // Inside window today?
      const nowMins = parts.hour * 60 + parts.minute;
      const startMins = winStartH * 60 + winStartM;
      const endMins = winEndH * 60 + winEndM;

      if (nowMins < startMins) {
        // before window today → bump to window start (in this tz)
        return dateFromTzLocal(
          tz, parts.year, parts.month, parts.day, winStartH, winStartM,
        );
      }
      if (nowMins < endMins) {
        // already in window — send asap (clamped to "earliest")
        return cursor;
      }
      // past window — fall through to next day
    }

    // advance to 00:00 the next calendar day in tz
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    // re-anchor at midnight of that next tz-day
    const np = getTzParts(next, tz);
    cursor = dateFromTzLocal(tz, np.year, np.month, np.day, 0, 0);
  }

  // Fallback — shouldn't happen, but never block the runner.
  return earliest;
}

// ---------------------------------------------------------------------------
// Throttle check
// ---------------------------------------------------------------------------

export interface ThrottleCheckResult {
  /** True when the caller may proceed with the send. */
  allow: boolean;
  /**
   * Minutes the caller should defer if !allow. Caller adds this to the
   * scheduled send time on outreach_campaign_contacts.
   */
  delayMinutes: number;
  /** Human-readable explanation for the run log. */
  reason: string;
}

export const DEFAULT_THROTTLE: Required<
  Pick<CampaignThrottle, "sends_per_hour" | "send_window_start" | "send_window_end" | "timezone">
> = {
  sends_per_hour: 50,
  send_window_start: DEFAULT_WINDOW_START,
  send_window_end: DEFAULT_WINDOW_END,
  timezone: DEFAULT_TZ,
};

/**
 * Pure-function throttle gate. Caller is responsible for counting how many
 * sends have happened on this campaign in the trailing 60 min — usually by
 * querying outreach_campaign_step_runs where campaign_id = ? and
 * sent_at >= now() - interval '1 hour'.
 */
export function throttleCheck(
  _campaignId: string,
  sendsLastHour: number,
  throttle?: CampaignThrottle,
): ThrottleCheckResult {
  const cap = Math.max(1, throttle?.sends_per_hour ?? DEFAULT_THROTTLE.sends_per_hour);
  if (sendsLastHour < cap) {
    return {
      allow: true,
      delayMinutes: 0,
      reason: `${sendsLastHour}/${cap} sends used in last hour`,
    };
  }

  // Over the cap — pause and reschedule. We pick a delay that smears the
  // backlog across the next hour rather than dumping them all at once.
  // 60 / cap gives the natural spacing; we add a small jitter (0-5min) so
  // multiple paused contacts don't bunch up.
  const spacingMinutes = Math.max(2, Math.ceil(60 / cap));
  const jitter = Math.floor(Math.random() * 5);
  const delayMinutes = spacingMinutes + jitter;

  return {
    allow: false,
    delayMinutes,
    reason: `Throttle hit: ${sendsLastHour}/${cap} sends in last hour — delaying ${delayMinutes}m`,
  };
}

// ---------------------------------------------------------------------------
// Convenience: combined pre-send check used by the cadence runner.
// ---------------------------------------------------------------------------

export interface PreSendCheckInput {
  campaignId: string;
  subject: string;
  body: string;
  contact: ContactLike;
  throttle?: CampaignThrottle;
  sendsLastHour: number;
  defaultTimezone?: string;
  now?: Date;
}

export interface PreSendCheckResult {
  ok: boolean;
  action: "send_now" | "delay" | "block";
  scheduledFor: Date;
  spam: SpamCheckResult;
  throttle: ThrottleCheckResult;
  reasons: string[];
}

/**
 * One-call gate for the cadence runner:
 *   const check = preSendCheck({...});
 *   if (check.action === "block") { logBlocked(check); markContactStatus("blocked"); return; }
 *   if (check.action === "delay") { reschedule(check.scheduledFor); return; }
 *   await provider.send(...);
 */
export function preSendCheck(input: PreSendCheckInput): PreSendCheckResult {
  const spam = spamScore(input.subject, input.body);
  if (spam.block) {
    return {
      ok: false,
      action: "block",
      scheduledFor: input.now ?? new Date(),
      spam,
      throttle: { allow: false, delayMinutes: 0, reason: "blocked by spam check" },
      reasons: [
        `Spam score ${spam.score} >= 60`,
        ...spam.reasons.slice(0, 5).map((r) => r.reason),
      ],
    };
  }

  const throttle = throttleCheck(input.campaignId, input.sendsLastHour, input.throttle);

  // Compute window-respecting send time even when throttle says OK — that
  // way an after-hours queued send still rolls forward.
  const windowed = bestSendTime(
    input.contact,
    input.defaultTimezone,
    input.throttle,
    { now: input.now },
  );

  const now = input.now ?? new Date();
  const inWindow = windowed.getTime() - now.getTime() < 60_000;

  if (!throttle.allow) {
    const delayed = new Date(
      Math.max(windowed.getTime(), now.getTime() + throttle.delayMinutes * 60_000),
    );
    return {
      ok: false,
      action: "delay",
      scheduledFor: delayed,
      spam,
      throttle,
      reasons: [throttle.reason],
    };
  }

  if (!inWindow) {
    return {
      ok: false,
      action: "delay",
      scheduledFor: windowed,
      spam,
      throttle,
      reasons: [
        `Outside send window — next slot ${windowed.toISOString()}`,
        ...(spam.warn ? [`Spam warn: score ${spam.score}`] : []),
      ],
    };
  }

  return {
    ok: true,
    action: "send_now",
    scheduledFor: now,
    spam,
    throttle,
    reasons: spam.warn ? [`Spam warn: score ${spam.score}`] : [],
  };
}
