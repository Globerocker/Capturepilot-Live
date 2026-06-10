/**
 * Email warmup helpers (R3-M5.2).
 *
 * Warmup is the practice of slowly ramping outbound volume from a fresh
 * sending domain / IP so mailbox providers (Gmail, Outlook, Yahoo) build
 * trust gradually. Cold-blasting from day 1 puts the domain on blocklists.
 *
 * The schedule lives in `email_warmup_schedule` (one row per day) and is
 * driven by the `/api/cron/email_warmup_send` cron, which calls
 * `shouldSendWarmupBatch()` + `getRemainingWarmupCapacity()` to decide
 * how many warmup emails to fire each tick.
 *
 * Peer list comes from `WARMUP_PEER_ADDRESSES` (comma-separated env var)
 * — a short list of friendly inboxes you control or trust. Each warmup
 * email is a small variant of the template so we don't ship identical
 * fingerprints across hundreds of sends.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const WARMUP_MAILBOX_DEFAULT = "default";

let _sb: SupabaseClient | null = null;
function getSb(): SupabaseClient | null {
    if (_sb) return _sb;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    _sb = createClient(url, key, { auth: { persistSession: false } });
    return _sb;
}

function todayDateString(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export interface WarmupScheduleRow {
    schedule_date: string;
    target_volume: number;
    actual_volume: number;
    mailbox_address: string;
    paused: boolean;
}

/**
 * Pull today's row. Returns null if no schedule exists yet (the migration
 * seeds 30 days; if you blow past day 30 you get null and the cron skips).
 */
export async function getTodaysWarmupRow(
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<WarmupScheduleRow | null> {
    const sb = getSb();
    if (!sb) return null;
    const { data } = await sb
        .from("email_warmup_schedule")
        .select("schedule_date, target_volume, actual_volume, mailbox_address, paused")
        .eq("schedule_date", todayDateString())
        .eq("mailbox_address", mailbox)
        .maybeSingle();
    return (data as WarmupScheduleRow | null) ?? null;
}

/** Target volume for today, or 0 if no schedule row / paused. */
export async function getTodaysWarmupTarget(mailbox: string = WARMUP_MAILBOX_DEFAULT): Promise<number> {
    const row = await getTodaysWarmupRow(mailbox);
    if (!row || row.paused) return 0;
    return row.target_volume;
}

/** target - actual; never negative. */
export async function getRemainingWarmupCapacity(
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<number> {
    const row = await getTodaysWarmupRow(mailbox);
    if (!row || row.paused) return 0;
    return Math.max(0, row.target_volume - row.actual_volume);
}

/**
 * True if we're under 80 % of today's target. The 80 % threshold gives the
 * cron a wide window — sending a small batch every 30 min keeps the curve
 * smooth instead of slamming the daily allotment in one shot.
 */
export async function shouldSendWarmupBatch(
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<boolean> {
    const row = await getTodaysWarmupRow(mailbox);
    if (!row || row.paused) return false;
    return row.actual_volume < row.target_volume * 0.8;
}

/** Bump `actual_volume` after a send batch finishes. */
export async function incrementWarmupActual(
    delta: number,
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<void> {
    const sb = getSb();
    if (!sb || delta <= 0) return;
    const row = await getTodaysWarmupRow(mailbox);
    if (!row) return;
    await sb
        .from("email_warmup_schedule")
        .update({
            actual_volume: row.actual_volume + delta,
            updated_at: new Date().toISOString(),
        })
        .eq("schedule_date", row.schedule_date)
        .eq("mailbox_address", row.mailbox_address);
}

/** Get the comma-separated peer list, trimmed + lowercased + deduped. */
export function getWarmupPeerList(): string[] {
    const raw = process.env.WARMUP_PEER_ADDRESSES || "";
    const seen = new Set<string>();
    const out: string[] = [];
    for (const piece of raw.split(",")) {
        const e = piece.trim().toLowerCase();
        if (!e) continue;
        if (!e.includes("@")) continue;
        if (seen.has(e)) continue;
        seen.add(e);
        out.push(e);
    }
    return out;
}

// ─── Template variants ───────────────────────────────────────
// Five subjects + five intros + five closings → 125 combinations of
// (subject × body) so we don't fingerprint as a single blast.
// All copy is innocuous business-talk that wouldn't look out of place
// landing in a colleague's inbox.

const WARMUP_SUBJECTS = [
    "Quick check-in",
    "Following up from last week",
    "Notes from the kickoff",
    "Touching base",
    "Quick update on the project",
];

const WARMUP_INTROS = [
    "Hey — wanted to share a quick note from the team meeting earlier.",
    "Hope your week is going well. A short update from our side.",
    "Hi there — circling back on the conversation from the other day.",
    "Quick heads up before the end of the week.",
    "Wanted to drop a quick note while it's top of mind.",
];

const WARMUP_BODIES = [
    "We're wrapping up the docs and should have a clean version ready by Friday. No action needed on your end yet — just keeping you in the loop.",
    "The team finished the first pass on the spec. We'll send the full draft over for review once internal feedback is back.",
    "Everything is on track for the milestone next week. I'll send a calendar hold for the sync once dates firm up.",
    "Quick recap: the discovery phase is closing out, the writeup goes into review tomorrow, and the next steps are the same as discussed.",
    "Status is green on our end. We'll regroup early next week to confirm the timing for the next phase.",
];

const WARMUP_CLOSINGS = [
    "Let me know if you want to jump on a call.",
    "Happy to chat anytime.",
    "Reach out if anything comes up before then.",
    "Talk soon.",
    "Catch you later this week.",
];

/** Deterministic pick across the variant arrays (seeded by `seed`). */
function pickVariant<T>(arr: T[], seed: number): T {
    return arr[seed % arr.length];
}

export interface WarmupEmailContent {
    subject: string;
    text: string;
    html: string;
}

/**
 * Build one warmup-email variant. Pass a different `seed` per send so the
 * batch ships with varied subject + body fingerprints. The HTML is plain
 * (no tracking pixels, no images) to mimic a real human conversation.
 */
export function buildWarmupEmail(seed: number): WarmupEmailContent {
    const subject = pickVariant(WARMUP_SUBJECTS, seed);
    const intro = pickVariant(WARMUP_INTROS, Math.floor(seed / 5));
    const body = pickVariant(WARMUP_BODIES, Math.floor(seed / 25));
    const closing = pickVariant(WARMUP_CLOSINGS, Math.floor(seed / 125));

    const text = [intro, "", body, "", closing, "", "— Team"].join("\n");
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#171717;max-width:560px;">
        <p style="margin:0 0 12px;">${intro}</p>
        <p style="margin:0 0 12px;">${body}</p>
        <p style="margin:0 0 12px;">${closing}</p>
        <p style="margin:18px 0 0;color:#737373;">— Team</p>
    </div>`;
    return { subject, text, html };
}

/** Pull the last 30 days of schedule rows for the admin chart. */
export async function getWarmupHistory(
    days: number = 30,
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<WarmupScheduleRow[]> {
    const sb = getSb();
    if (!sb) return [];
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const sinceStr = `${since.getUTCFullYear()}-${String(since.getUTCMonth() + 1).padStart(2, "0")}-${String(since.getUTCDate()).padStart(2, "0")}`;
    const { data } = await sb
        .from("email_warmup_schedule")
        .select("schedule_date, target_volume, actual_volume, mailbox_address, paused")
        .eq("mailbox_address", mailbox)
        .gte("schedule_date", sinceStr)
        .order("schedule_date", { ascending: true });
    return (data as WarmupScheduleRow[] | null) ?? [];
}

/** Flip pause state for the whole horizon (every future schedule row). */
export async function setWarmupPaused(
    paused: boolean,
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<void> {
    const sb = getSb();
    if (!sb) return;
    await sb
        .from("email_warmup_schedule")
        .update({ paused, updated_at: new Date().toISOString() })
        .eq("mailbox_address", mailbox)
        .gte("schedule_date", todayDateString());
}

/** Read pause state from the row for today. */
export async function isWarmupPaused(
    mailbox: string = WARMUP_MAILBOX_DEFAULT,
): Promise<boolean> {
    const row = await getTodaysWarmupRow(mailbox);
    return row?.paused ?? false;
}
