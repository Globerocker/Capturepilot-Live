/**
 * Email settings config — controls which emails are enabled and who receives them.
 *
 * Audience values:
 *   - "self_service": SaaS self-service users
 *   - "consulting": Managed consulting clients (agency customers)
 *   - "lead": Leads captured via Quick Checker (not yet signed up)
 *   - "all_users": Both self_service and consulting
 *
 * Category values (drives legal footer):
 *   - "transactional": Company updates — no unsubscribe link, just "Manage preferences"
 *   - "marketing": Commercial/promotional — CAN-SPAM unsubscribe link required
 *
 * To disable an email, set enabled: false. To change audience, edit the audience array.
 *
 * NEXT PHASE: Move this to a Supabase `email_settings` table for admin-editable runtime toggles.
 */

export type Audience = "self_service" | "consulting" | "lead" | "all_users";
export type EmailCategory = "transactional" | "marketing";

export interface EmailConfig {
    enabled: boolean;
    audience: Audience[];
    category: EmailCategory;
    /** Human-readable label for admin UI */
    label: string;
    /** Short description for admin UI */
    description: string;
}

export const EMAIL_SETTINGS: Record<string, EmailConfig> = {
    // ─── Onboarding ────────────────────────────────────────
    welcome: {
        enabled: true,
        audience: ["self_service"],
        category: "transactional",
        label: "Welcome (Self-Service)",
        description: "Sent when a new self-service user completes signup.",
    },
    consulting_welcome: {
        enabled: true,
        audience: ["consulting"],
        category: "transactional",
        label: "Welcome (Consulting)",
        description: "Sent when admin onboards a consulting client with portal login.",
    },

    // ─── Transactional ─────────────────────────────────────
    task_notification: {
        enabled: true,
        audience: ["consulting"],
        category: "transactional",
        label: "Task Assignment",
        description: "Sent when a task is assigned to a consulting client.",
    },
    opportunity_alert: {
        enabled: true,
        audience: ["all_users"],
        category: "transactional",
        label: "Opportunity Alert",
        description: "Daily email with top matching opportunities (max 1 per user per 24h).",
    },

    // ─── Lifecycle ─────────────────────────────────────────
    quick_checker: {
        enabled: true,
        audience: ["lead"],
        category: "marketing",
        label: "Quick Checker Results",
        description: "Sent when a Quick Checker lead provides their email.",
    },
    trial_expiring_3d: {
        enabled: true,
        audience: ["self_service"],
        category: "transactional",
        label: "Trial Expiring (3 days)",
        description: "Sent 3 days before trial ends.",
    },
    trial_expiring_1d: {
        enabled: true,
        audience: ["self_service"],
        category: "transactional",
        label: "Trial Expiring (Last day)",
        description: "Final warning on last day of trial.",
    },
    payment_failed: {
        enabled: true,
        audience: ["self_service"],
        category: "transactional",
        label: "Payment Failed",
        description: "Sent when Stripe payment fails.",
    },
    subscription_canceled: {
        enabled: true,
        audience: ["self_service"],
        category: "transactional",
        label: "Subscription Canceled",
        description: "Sent when subscription is canceled.",
    },

    // ─── Marketing ─────────────────────────────────────────
    beta_deadline_8d: {
        enabled: true,
        audience: ["self_service"],
        category: "marketing",
        label: "Beta Deadline (8 days)",
        description: "First beta deadline reminder with BETA25 promo.",
    },
    beta_deadline_1d: {
        enabled: true,
        audience: ["self_service"],
        category: "marketing",
        label: "Beta Deadline (Last day)",
        description: "Final beta deadline reminder.",
    },

    // ─── Educational (Agency/Consulting focus) ─────────────
    edu_contracting_101: {
        enabled: true,
        audience: ["consulting"],
        category: "marketing",
        label: "Learning: Federal Contracting 101",
        description: "Intro guide to federal contracting — for new consulting clients.",
    },
    edu_naics_codes: {
        enabled: true,
        audience: ["self_service"],
        category: "marketing",
        label: "Learning: NAICS Codes Explained",
        description: "Explainer on NAICS codes and how to pick them.",
    },
    edu_set_asides: {
        enabled: true,
        audience: ["all_users"],
        category: "marketing",
        label: "Learning: Set-Aside Programs",
        description: "Deep dive into 8(a), SDVOSB, WOSB, HUBZone and other set-aside programs.",
    },
    edu_capability_statement: {
        enabled: true,
        audience: ["consulting"],
        category: "marketing",
        label: "Learning: Capability Statement Guide",
        description: "6 essential sections of a winning capability statement.",
    },
};

/**
 * Check whether an email is enabled before sending.
 * Used by sendXxx functions to respect runtime toggles.
 */
export function isEmailEnabled(key: string): boolean {
    return EMAIL_SETTINGS[key]?.enabled ?? true;
}

/**
 * Get the category for an email — controls footer unsubscribe behavior.
 */
export function getEmailCategory(key: string): EmailCategory {
    return EMAIL_SETTINGS[key]?.category ?? "transactional";
}
