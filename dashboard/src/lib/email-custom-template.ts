/**
 * Custom template loader + merge tag substitution.
 *
 * When an admin saves a custom template in Unlayer, we store the HTML with
 * {{mergeTags}} in the email_templates table. At send time, if a published
 * custom template exists for a key, we use it instead of the code template.
 */

import { createClient } from "@supabase/supabase-js";

export interface CustomTemplate {
    html: string;
    subject: string | null;
}

let _cache: Record<string, CustomTemplate | null> = {};
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000;

function getAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

/**
 * Load a published custom template from the DB. Returns null if none exists.
 * Cached for 60s to avoid per-send DB round-trips.
 */
export async function loadCustomTemplate(key: string): Promise<CustomTemplate | null> {
    const now = Date.now();
    if (now - _cacheAt > CACHE_TTL_MS) {
        _cache = {};
        _cacheAt = now;
    }
    if (key in _cache) return _cache[key];

    const sb = getAdmin();
    if (!sb) {
        _cache[key] = null;
        return null;
    }

    const { data, error } = await sb
        .from("email_templates")
        .select("html, subject")
        .eq("template_key", key)
        .eq("published", true)
        .maybeSingle();

    if (error || !data || !data.html) {
        _cache[key] = null;
        return null;
    }

    _cache[key] = { html: data.html, subject: data.subject };
    return _cache[key];
}

/** Invalidate cache — called when a template is saved/published. */
export function invalidateCustomTemplateCache() {
    _cache = {};
    _cacheAt = 0;
}

/**
 * Substitute {{mergeTags}} in the given string with values from vars.
 * Missing variables render as empty strings (safe default).
 */
export function renderMergeTags(template: string, vars: Record<string, string | number | undefined | null>): string {
    return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) => {
        const val = vars[key];
        if (val === null || val === undefined) return "";
        return String(val);
    });
}

/**
 * Catalog of merge tags available in each template — used by the Unlayer editor
 * to show the user which placeholders they can insert.
 */
export const MERGE_TAGS: Record<string, { name: string; value: string; sample: string }[]> = {
    welcome: [
        { name: "Company Name", value: "companyName", sample: "Acme Corp" },
        { name: "Dashboard URL", value: "dashboardUrl", sample: "https://app.capturepilot.com/dashboard" },
    ],
    consulting_welcome: [
        { name: "Contact Name", value: "contactName", sample: "Donny" },
        { name: "Company Name", value: "companyName", sample: "SmartPipe" },
        { name: "Email", value: "email", sample: "donny@smart-pipe.com" },
        { name: "Temporary Password", value: "tempPassword", sample: "Test1234!" },
        { name: "Login URL", value: "loginUrl", sample: "https://app.capturepilot.com/login" },
    ],
    task_notification: [
        { name: "Contact Name", value: "contactName", sample: "Donny" },
        { name: "Task Title", value: "taskTitle", sample: "Upload Capability Statement" },
        { name: "Task Description", value: "taskDescription", sample: "Please upload your capability statement..." },
        { name: "Due Date", value: "dueDate", sample: "April 18, 2026" },
        { name: "Tasks URL", value: "tasksUrl", sample: "https://app.capturepilot.com/portal/tasks" },
    ],
    trial_expiring_3d: [
        { name: "Contact Name", value: "contactName", sample: "Sarah" },
        { name: "Days Left", value: "daysLeft", sample: "3" },
        { name: "Billing URL", value: "billingUrl", sample: "https://app.capturepilot.com/settings/billing" },
    ],
    trial_expiring_1d: [
        { name: "Contact Name", value: "contactName", sample: "Sarah" },
        { name: "Billing URL", value: "billingUrl", sample: "https://app.capturepilot.com/settings/billing" },
    ],
    payment_failed: [
        { name: "Contact Name", value: "contactName", sample: "Sarah" },
        { name: "Billing URL", value: "billingUrl", sample: "https://app.capturepilot.com/settings/billing" },
    ],
    subscription_canceled: [
        { name: "Contact Name", value: "contactName", sample: "Sarah" },
        { name: "Billing URL", value: "billingUrl", sample: "https://app.capturepilot.com/settings/billing" },
    ],
    beta_deadline_8d: [
        { name: "Contact Name", value: "contactName", sample: "there" },
        { name: "Days Until Cutoff", value: "daysUntilCutoff", sample: "8" },
        { name: "Checkout URL", value: "checkoutUrl", sample: "https://app.capturepilot.com/settings/billing?promo=BETA25" },
    ],
    beta_deadline_1d: [
        { name: "Contact Name", value: "contactName", sample: "there" },
        { name: "Checkout URL", value: "checkoutUrl", sample: "https://app.capturepilot.com/settings/billing?promo=BETA25" },
    ],
    edu_contracting_101: [
        { name: "Contact Name", value: "contactName", sample: "Donny" },
        { name: "Blog URL", value: "blogUrl", sample: "https://www.capturepilot.com/blog/government-contracting-101" },
    ],
    edu_naics_codes: [
        { name: "Contact Name", value: "contactName", sample: "Sarah" },
        { name: "Blog URL", value: "blogUrl", sample: "https://www.capturepilot.com/blog/naics-codes-explained" },
    ],
    edu_set_asides: [
        { name: "Contact Name", value: "contactName", sample: "there" },
        { name: "Blog URL", value: "blogUrl", sample: "https://www.capturepilot.com/blog/set-aside-programs" },
    ],
    edu_capability_statement: [
        { name: "Contact Name", value: "contactName", sample: "Donny" },
        { name: "Blog URL", value: "blogUrl", sample: "https://www.capturepilot.com/blog/capability-statement-guide" },
    ],
};

/**
 * Non-editable templates — these render dynamic tables/charts that don't
 * translate cleanly to a visual editor. Kept as code-only.
 */
export const NON_EDITABLE_TEMPLATES = new Set([
    "opportunity_alert",  // Renders a dynamic opportunity table
    "quick_checker",       // Renders score circle + dynamic match table
]);
