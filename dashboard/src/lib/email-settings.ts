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
    beta_deadline_8d: { enabled: true, audience: ["self_service"], category: "marketing", label: "Beta Deadline (8 days)", description: "First beta deadline reminder." },
    beta_deadline_1d: { enabled: true, audience: ["self_service"], category: "marketing", label: "Beta Deadline (Last day)", description: "Final beta deadline reminder." },
    edu_contracting_101: { enabled: true, audience: ["consulting"], category: "marketing", label: "Learning: Federal Contracting 101", description: "Intro guide to federal contracting." },
    edu_naics_codes: { enabled: true, audience: ["self_service"], category: "marketing", label: "Learning: NAICS Codes Explained", description: "Explainer on NAICS codes." },
    edu_set_asides: { enabled: true, audience: ["all_users"], category: "marketing", label: "Learning: Set-Aside Programs", description: "Deep dive into set-aside programs." },
    edu_capability_statement: { enabled: true, audience: ["consulting"], category: "marketing", label: "Learning: Capability Statement Guide", description: "Capability statement sections." },
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
