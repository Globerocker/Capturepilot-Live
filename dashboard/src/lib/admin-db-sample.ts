/**
 * Shared helpers for the /api/admin/db/* family of routes.
 *
 *   - SENSITIVE_TABLES: tables that require an extra `confirm=true` query
 *     param before sample rows are returned. The list is conservative — if
 *     a table holds passwords, billing data, raw lead PII, or anything
 *     the GDPR audit would care about, add it here.
 *   - REDACTED_COLUMNS: column names that get replaced with "***" in any
 *     sample response, regardless of which table they appear in. Belt-and-
 *     suspenders for token / secret leaks even when the table itself
 *     isn't flagged sensitive.
 *   - redactRow / isAllowedTable / parseLimit: pure helpers used by the
 *     sample + schema routes.
 *
 * Keeping this list in /lib (not the route file) lets the page-level UI
 * import SENSITIVE_TABLES too, so the badge + confirmation prompt stays in
 * sync with what the server enforces.
 */

export const SENSITIVE_TABLES = new Set<string>([
    "user_profiles",
    "users",
    "client_users",
    "auth_users",
    "leads",
    "lead_briefs",
    "contracts",
    "stripe_customers",
    "billing_history",
    "payment_methods",
    "cancellation_feedback",
    "client_messages",
    "messages",
    "client_documents",
    "api_tokens",
    "outreach_log",
    "scheduled_emails",
    "email_log",
    "extracted_contacts",
    "contacts",
]);

/**
 * Columns whose values are NEVER returned in sample rows, even if the table
 * itself isn't in SENSITIVE_TABLES. Matched case-insensitively against the
 * column name.
 */
export const REDACTED_COLUMNS = new Set<string>([
    "password",
    "password_hash",
    "encrypted_password",
    "secret",
    "api_key",
    "api_token",
    "access_token",
    "refresh_token",
    "provider_token",
    "stripe_customer_id",
    "stripe_subscription_id",
    "stripe_payment_method_id",
    "card_last4",
    "ssn",
    "tax_id",
]);

export function isRedactedColumn(name: string): boolean {
    return REDACTED_COLUMNS.has(name.toLowerCase());
}

export function redactRow<T extends Record<string, unknown>>(row: T): T {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        out[k] = isRedactedColumn(k) && v !== null ? "***" : v;
    }
    return out as T;
}

/**
 * Conservative table-name validator. Postgres identifiers can technically
 * be anything in quotes, but ours follow the lowercase + underscore
 * convention. Rejecting anything else closes a SQL-injection vector for
 * any route that interpolates the name back into a raw query.
 */
export function isAllowedTableName(name: string): boolean {
    return /^[a-z_][a-z0-9_]{0,62}$/.test(name);
}

export function parseLimit(raw: string | null, fallback = 50, max = 200): number {
    const n = raw ? Number(raw) : fallback;
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.max(1, Math.floor(n)), max);
}
