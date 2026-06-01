/**
 * Email settings — runtime-configurable enabled/audience per email template.
 *
 * Loads overrides from the `email_settings` Supabase table with a 60s cache.
 * Falls back to config defaults when the DB is unreachable or a row is missing.
 *
 * Audience values:
 *   - "self_service": SaaS self-service users
 *   - "consulting": Managed consulting clients
 *   - "lead": Leads captured via Quick Checker
 *   - "all_users": Both self_service and consulting
 *
 * Category values (drives legal footer):
 *   - "transactional": Company updates — no unsubscribe link, "Manage preferences" only
 *   - "marketing": Commercial/promotional — CAN-SPAM unsubscribe link required
 */

import { createClient } from "@supabase/supabase-js";

export type Audience = "self_service" | "consulting" | "lead" | "all_users";
export type EmailCategory = "transactional" | "marketing";

export interface EmailConfig {
    enabled: boolean;
    audience: Audience[];
    category: EmailCategory;
    label: string;
    description: string;
}

/** Config defaults — used as fallback when DB is unreachable or row is missing. */
export const DEFAULT_EMAIL_SETTINGS: Record<string, EmailConfig> = {
    welcome: { enabled: true, audience: ["self_service"], category: "transactional", label: "Welcome (Self-Service)", description: "Sent when a new self-service user completes signup." },
    consulting_welcome: { enabled: true, audience: ["consulting"], category: "transactional", label: "Welcome (Consulting)", description: "Sent when admin onboards a consulting client." },
    task_notification: { enabled: true, audience: ["consulting"], category: "transactional", label: "Task Assignment", description: "Sent when a task is assigned to a consulting client." },
    opportunity_alert: { enabled: true, audience: ["all_users"], category: "transactional", label: "Opportunity Alert", description: "Daily email with top matching opportunities." },
    quick_checker: { enabled: true, audience: ["lead"], category: "marketing", label: "Quick Checker Results", description: "Sent when a Quick Checker lead provides their email." },
    trial_expiring_3d: { enabled: true, audience: ["self_service"], category: "transactional", label: "Trial Expiring (3 days)", description: "Sent 3 days before trial ends." },
    trial_expiring_1d: { enabled: true, audience: ["self_service"], category: "transactional", label: "Trial Expiring (Last day)", description: "Final warning on last day of trial." },
    payment_failed: { enabled: true, audience: ["self_service"], category: "transactional", label: "Payment Failed", description: "Sent when Stripe payment fails." },
    subscription_canceled: { enabled: true, audience: ["self_service"], category: "transactional", label: "Subscription Canceled", description: "Sent when subscription is canceled." },
    beta_invite: { enabled: true, audience: ["lead"], category: "marketing", label: "Beta Invite (Manual)", description: "Sent when admin manually invites a beta tester from /admin/beta-invites." },
    beta_deadline_8d: { enabled: true, audience: ["self_service"], category: "marketing", label: "Beta Deadline (8 days)", description: "First beta deadline reminder." },
    beta_deadline_1d: { enabled: true, audience: ["self_service"], category: "marketing", label: "Beta Deadline (Last day)", description: "Final beta deadline reminder." },
    edu_contracting_101: { enabled: true, audience: ["consulting"], category: "marketing", label: "Learning: Federal Contracting 101", description: "Intro guide to federal contracting." },
    edu_naics_codes: { enabled: true, audience: ["self_service"], category: "marketing", label: "Learning: NAICS Codes Explained", description: "Explainer on NAICS codes." },
    edu_set_asides: { enabled: true, audience: ["all_users"], category: "marketing", label: "Learning: Set-Aside Programs", description: "Deep dive into set-aside programs." },
    edu_capability_statement: { enabled: true, audience: ["consulting"], category: "marketing", label: "Learning: Capability Statement Guide", description: "Capability statement sections." },

    // 90-day Facebook-lead nurture sequence (see lib/email-nurture-templates.ts)
    nurture_01_welcome:             { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 01 · Welcome (Day 0)",                description: "First touch — confirms PDF delivery, sets expectations, asks for the one biggest confusion to shape future emails." },
    nurture_02_opp_anatomy:         { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 02 · Opp anatomy (Day 3)",             description: "Teaches the 5 fields that matter on a SAM.gov opportunity. Soft CTA to dashboard." },
    nurture_03_naics_misses:        { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 03 · NAICS misses (Day 8)",            description: "5 high-spend NAICS codes most small businesses skip. Reply hook: \"tell me your industry, I'll spot the misses\"." },
    nurture_04_past_perf_bootstrap: { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 04 · Past-perf bootstrap (Day 15)",    description: "How to build past performance from $0 in federal awards. Soft CTA to $70 kit's cap-statement template." },
    nurture_05_audit_call:          { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 05 · Audit call CTA (Day 22)",         description: "First direct conversion push. Free 30-min B2G Audit, 3 live opps delivered in 24h after the call." },
    nurture_06_sources_sought:      { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 06 · Sources Sought (Day 30)",         description: "The procurement step 80% of contractors skip. Re-warm after audit-call push." },
    nurture_07_cap_statement:       { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 07 · Cap statement teardown (Day 38)", description: "Hybrid: value content + offer to roast their capability statement for free." },
    nurture_08_kit:                 { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 08 · $70 Kit (Day 45)",                description: "Second conversion push at lower price point. Concrete deliverables, no upsell." },
    nurture_09_fiscal_cliff:        { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 09 · Year-end fiscal cliff (Day 55)",  description: "Timely: 30% of federal spend happens Aug-Sep. What to do in June-July to prep." },
    nurture_10_why_bids_lose:       { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 10 · Why bids lose (Day 65)",          description: "5 reasons account for 90% of small-biz losses. Offer to review a real bid loss for free." },
    nurture_11_pilot:               { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 11 · Pilot Program (Day 75)",          description: "Third + highest conversion push. Done-for-you 90-day program at $4.5K + 5% success fee." },
    nurture_12_goodbye:             { enabled: true, audience: ["lead"], category: "marketing", label: "Nurture 12 · Three doors (Day 90)",            description: "Final sunset. Three options or graceful unsubscribe — protects deliverability + cleans the list." },
};

// Cache: 60s TTL
let _cache: Record<string, EmailConfig> | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000;

function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

/**
 * Load all settings from DB with cache. Falls back to defaults on error.
 * Returns the merged map: DB rows override defaults, missing rows use defaults.
 */
export async function loadEmailSettings(): Promise<Record<string, EmailConfig>> {
    const now = Date.now();
    if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;

    const merged: Record<string, EmailConfig> = { ...DEFAULT_EMAIL_SETTINGS };

    try {
        const sb = getAdminClient();
        if (!sb) {
            _cache = merged;
            _cacheAt = now;
            return merged;
        }

        const { data, error } = await sb
            .from("email_settings")
            .select("key, enabled, audience, category, label, description");

        if (error) {
            console.warn("[email-settings] DB read failed, using defaults:", error.message);
        } else if (data) {
            for (const row of data) {
                merged[row.key] = {
                    enabled: row.enabled ?? true,
                    audience: (row.audience ?? []) as Audience[],
                    category: (row.category ?? "transactional") as EmailCategory,
                    label: row.label ?? DEFAULT_EMAIL_SETTINGS[row.key]?.label ?? row.key,
                    description: row.description ?? DEFAULT_EMAIL_SETTINGS[row.key]?.description ?? "",
                };
            }
        }
    } catch (e) {
        console.warn("[email-settings] Unexpected error, using defaults:", (e as Error).message);
    }

    _cache = merged;
    _cacheAt = now;
    return merged;
}

/** Invalidate the cache — called from the PATCH route after an admin update. */
export function invalidateEmailSettingsCache() {
    _cache = null;
    _cacheAt = 0;
}

/**
 * Check whether an email is enabled. Uses DB + cache, falls back to default.
 */
export async function isEmailEnabled(key: string): Promise<boolean> {
    const settings = await loadEmailSettings();
    return settings[key]?.enabled ?? DEFAULT_EMAIL_SETTINGS[key]?.enabled ?? true;
}

/**
 * Get the category for an email — controls footer unsubscribe behavior.
 */
export async function getEmailCategory(key: string): Promise<EmailCategory> {
    const settings = await loadEmailSettings();
    return settings[key]?.category ?? DEFAULT_EMAIL_SETTINGS[key]?.category ?? "transactional";
}

/** Sync helper for preview routes where async is awkward — uses defaults only. */
export function getDefaultCategory(key: string): EmailCategory {
    return DEFAULT_EMAIL_SETTINGS[key]?.category ?? "transactional";
}

/** Back-compat alias so existing code using EMAIL_SETTINGS map still works (defaults only). */
export const EMAIL_SETTINGS = DEFAULT_EMAIL_SETTINGS;
