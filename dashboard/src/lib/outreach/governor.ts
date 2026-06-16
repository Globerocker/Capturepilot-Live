/**
 * Deliverability governor for the outreach cadence.
 *
 * Cold-blasting a fresh domain is the fastest way onto a blocklist. This module
 * keeps real campaign sending inside safe limits:
 *
 *   - Warm-up ramp     — a per-day ceiling that climbs slowly from a small
 *                        number so mailbox providers build trust gradually.
 *   - Daily cap        — a hard ceiling regardless of warm-up.
 *   - Per-domain cap   — never hammer one recipient domain (e.g. lots of
 *                        @gmail.com) in a single day.
 *   - Small batches    — each cadence tick fires a randomized small batch
 *                        (default 5–20) rather than the whole ready queue.
 *   - Jitter           — follow-up sends are spread out (default 30s–7min)
 *                        instead of firing on a round-number schedule.
 *   - MX + syntax pre-check — skip addresses that can't receive mail before
 *                        we ever hand them to Resend, killing hard bounces.
 *
 * Settings live in outreach_settings under key 'send_governor'. Defaults are
 * conservative; the admin Settings tab can override them.
 */
import { promises as dns } from "node:dns";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export interface GovernorSettings {
    enabled: boolean;
    daily_cap: number;
    per_domain_daily_cap: number;
    batch_min: number;
    batch_max: number;
    jitter_min_sec: number;
    jitter_max_sec: number;
    warmup_enabled: boolean;
    warmup_start_date: string | null; // 'YYYY-MM-DD'
    warmup_ramp: number[];
}

export const GOVERNOR_DEFAULTS: GovernorSettings = {
    enabled: true,
    daily_cap: 300,
    per_domain_daily_cap: 25,
    batch_min: 5,
    batch_max: 20,
    jitter_min_sec: 120,   // 2 min
    jitter_max_sec: 420,   // 7 min
    warmup_enabled: true,
    warmup_start_date: null,
    warmup_ramp: [20, 30, 50, 75, 100, 150, 200, 250, 300],
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailDomain(email: string): string {
    const at = email.lastIndexOf("@");
    return at === -1 ? "" : email.slice(at + 1).toLowerCase().trim();
}

export function todayUtcStartIso(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T00:00:00.000Z`;
}
function todayUtcDate(): string {
    return todayUtcStartIso().slice(0, 10);
}

export async function loadGovernor(sb: SbAny): Promise<GovernorSettings> {
    try {
        const { data } = await sb
            .from("outreach_settings")
            .select("value")
            .eq("key", "send_governor")
            .maybeSingle();
        const v = (data?.value || {}) as Partial<GovernorSettings>;
        const merged = { ...GOVERNOR_DEFAULTS, ...v };
        if (!Array.isArray(merged.warmup_ramp) || merged.warmup_ramp.length === 0) {
            merged.warmup_ramp = GOVERNOR_DEFAULTS.warmup_ramp;
        }
        return merged;
    } catch {
        return { ...GOVERNOR_DEFAULTS };
    }
}

/**
 * Persist the warm-up start date the first time we send. Day 0 of the ramp is
 * the first day any real campaign send goes out.
 */
export async function ensureWarmupStart(sb: SbAny, gov: GovernorSettings): Promise<GovernorSettings> {
    if (!gov.warmup_enabled || gov.warmup_start_date) return gov;
    const start = todayUtcDate();
    try {
        await sb.from("outreach_settings").upsert(
            { key: "send_governor", value: { ...gov, warmup_start_date: start } },
            { onConflict: "key" },
        );
    } catch { /* non-fatal — we'll try again next tick */ }
    return { ...gov, warmup_start_date: start };
}

/** Today's effective ceiling: min(hard daily cap, warm-up ramp for the day). */
export function effectiveDailyCap(gov: GovernorSettings): number {
    if (!gov.warmup_enabled) return gov.daily_cap;
    let dayIdx = 0;
    if (gov.warmup_start_date) {
        const start = Date.parse(gov.warmup_start_date + "T00:00:00.000Z");
        const now = Date.parse(todayUtcStartIso());
        if (Number.isFinite(start)) dayIdx = Math.max(0, Math.round((now - start) / 86_400_000));
    }
    const ramp = gov.warmup_ramp;
    const rampCap = ramp[Math.min(dayIdx, ramp.length - 1)];
    return Math.min(gov.daily_cap, rampCap);
}

/** Count real campaign emails sent so far today (step_runs, status='sent'). */
export async function countSentToday(sb: SbAny): Promise<number> {
    const { count } = await sb
        .from("outreach_campaign_step_runs")
        .select("id", { count: "exact", head: true })
        .eq("channel", "email")
        .eq("status", "sent")
        .gte("sent_at", todayUtcStartIso());
    return count || 0;
}

/** Per-recipient-domain send counts for today, for the per-domain cap. */
export async function domainSentToday(sb: SbAny): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    try {
        const { data } = await sb
            .from("outreach_campaign_step_runs")
            .select("id, campaign_contact:outreach_campaign_contacts!inner(contact:outreach_contacts!inner(email))")
            .eq("channel", "email")
            .eq("status", "sent")
            .gte("sent_at", todayUtcStartIso())
            .limit(5000);
        for (const row of (data || []) as unknown[]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = row as any;
            const cc = Array.isArray(r.campaign_contact) ? r.campaign_contact[0] : r.campaign_contact;
            const contact = cc && (Array.isArray(cc.contact) ? cc.contact[0] : cc.contact);
            const email = contact?.email as string | undefined;
            if (!email) continue;
            const dom = emailDomain(email);
            if (dom) out[dom] = (out[dom] || 0) + 1;
        }
    } catch { /* fail-open — caller still has the daily cap */ }
    return out;
}

// ── MX + syntax pre-check (free; kills hard bounces before they happen) ──
const mxCache = new Map<string, boolean>();

export async function isDeliverable(email: string): Promise<{ ok: boolean; reason?: string }> {
    if (!email || !EMAIL_RX.test(email)) return { ok: false, reason: "invalid syntax" };
    const dom = emailDomain(email);
    if (!dom) return { ok: false, reason: "no domain" };
    if (mxCache.has(dom)) {
        return mxCache.get(dom) ? { ok: true } : { ok: false, reason: "no MX record" };
    }
    try {
        const recs = await dns.resolveMx(dom);
        const ok = Array.isArray(recs) && recs.length > 0;
        mxCache.set(dom, ok);
        return ok ? { ok: true } : { ok: false, reason: "no MX record" };
    } catch {
        // No MX / NXDOMAIN. Cache the miss so we don't re-resolve a dead domain.
        mxCache.set(dom, false);
        return { ok: false, reason: "domain unresolvable" };
    }
}

/** Randomized small batch size for this tick. */
export function pickBatchSize(gov: GovernorSettings): number {
    const lo = Math.max(1, Math.min(gov.batch_min, gov.batch_max));
    const hi = Math.max(gov.batch_min, gov.batch_max);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Add a random jitter (seconds) to a base ISO timestamp. */
export function jitter(baseIso: string, gov: GovernorSettings): string {
    const lo = Math.max(0, gov.jitter_min_sec);
    const hi = Math.max(lo, gov.jitter_max_sec);
    const extra = (lo + Math.floor(Math.random() * (hi - lo + 1))) * 1000;
    return new Date(Date.parse(baseIso) + extra).toISOString();
}
