import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { daysUntilExpiry, EXPIRY_WARN_DAYS, probes } from "@/lib/connectors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/health/integrations
 *
 * Drives the /admin/health/integrations LIST page. Returns one row per
 * external service we depend on, annotated with:
 *   - configured: env var present?
 *   - last_status / last_check_at: from the hourly health_monitor cron
 *   - last_success_at: best-available recency signal per service (see notes)
 *   - rotation_due: days until expires_at crosses the EXPIRY_WARN_DAYS threshold
 *
 * The list mirrors the requested order (Stripe, Resend, HubSpot, Apollo, SAM,
 * OpenAI, Meta CAPI, LinkedIn, Supabase) but PROMOTES any slug in that list
 * that's already registered in `api_connectors` (the registry is the source of
 * truth for `expires_at` + operator-edited notes). LinkedIn is rendered as a
 * placeholder when no row exists yet so the operator can see it's pending.
 *
 * No probes fire here — that's what the detail page's "Test connection" does.
 * This handler only reads cached state from Postgres so the LIST page is fast.
 */

const REQUIRED_SLUGS = [
    "stripe",
    "resend",
    "hubspot",
    "apollo",
    "sam-gov",
    "openai",
    "meta-capi",
    "linkedin",
    "supabase",
] as const;

type ConnectorRow = {
    id: string;
    slug: string;
    label: string;
    env_var_name: string;
    category: string;
    enabled: boolean;
    rotation_days: number | null;
    expires_at: string | null;
    docs_url: string | null;
    rotate_url: string | null;
    notes: string | null;
    last_check_at: string | null;
    last_status: string | null;
    last_detail: string | null;
    consecutive_fails: number;
};

type IntegrationSummary = {
    slug: string;
    label: string;
    env_var_name: string;
    configured: boolean;
    last_status: string | null;
    last_check_at: string | null;
    last_detail: string | null;
    days_until_expiry: number | null;
    rotation_warn: boolean;
    rotation_days: number | null;
    expires_at: string | null;
    docs_url: string | null;
    rotate_url: string | null;
    has_probe: boolean;
    consecutive_fails: number;
    /** Best-effort "last call we know happened" timestamp from a domain table. */
    last_success_at: string | null;
    last_success_source: string | null;
    open_alert_count: number;
};

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

// Best-effort "we definitely saw this service do work" lookup. Each slug uses
// the cheapest domain query that proves real traffic — falls back to null when
// nothing matches (the UI then shows "—" + the connector probe timestamp).
async function deriveLastSuccess(
    sb: ReturnType<typeof db>,
    slug: string,
): Promise<{ at: string | null; source: string | null }> {
    try {
        if (slug === "resend") {
            const { data } = await sb
                .from("email_events")
                .select("occurred_at")
                .eq("event_type", "sent")
                .order("occurred_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { occurred_at: string } | null;
            if (row?.occurred_at) return { at: row.occurred_at, source: "email_events.sent" };
        }
        if (slug === "hubspot") {
            // marketing_leads.notes->synced_to_hubspot_at (inferred profile) — fall
            // back to outreach_prospects.hubspot_contact_id which is set on push.
            const { data } = await sb
                .from("marketing_leads")
                .select("updated_at, inferred_profile")
                .not("inferred_profile", "is", null)
                .order("updated_at", { ascending: false })
                .limit(5);
            const row = ((data || []) as Array<{ updated_at: string; inferred_profile: Record<string, unknown> }>)
                .find(r => r.inferred_profile && r.inferred_profile.synced_to_hubspot);
            if (row?.updated_at) return { at: row.updated_at, source: "marketing_leads.synced_to_hubspot" };
        }
        if (slug === "stripe") {
            // Any user with a stripe_customer_id was created via a successful
            // Checkout — most recent row = most recent live API call.
            const { data } = await sb
                .from("user_profiles")
                .select("updated_at")
                .not("stripe_customer_id", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { updated_at: string } | null;
            if (row?.updated_at) return { at: row.updated_at, source: "user_profiles.stripe_customer_id" };
        }
        if (slug === "sam-gov") {
            // ingest_sam writes its end-of-run row to cron_runs. Newest "ok"
            // row = newest successful SAM round-trip.
            const { data } = await sb
                .from("cron_runs")
                .select("started_at")
                .like("route", "%ingest_sam%")
                .eq("status", "ok")
                .order("started_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { started_at: string } | null;
            if (row?.started_at) return { at: row.started_at, source: "cron_runs.ingest_sam" };
        }
        if (slug === "openai") {
            // ai_win_strategy / structured_requirements crons drive most OpenAI
            // calls — most recent successful run is a strong recency signal.
            const { data } = await sb
                .from("cron_runs")
                .select("started_at, route")
                .eq("status", "ok")
                .or("route.ilike.%ai_%,route.ilike.%enrich%,route.ilike.%strategic_scoring%")
                .order("started_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { started_at: string; route: string } | null;
            if (row?.started_at) return { at: row.started_at, source: `cron_runs.${row.route.replace("/api/cron/", "")}` };
        }
        if (slug === "apollo") {
            // Any contact row with apollo_id was enriched by the live API.
            const { data } = await sb
                .from("contacts")
                .select("updated_at")
                .not("apollo_id", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { updated_at: string } | null;
            if (row?.updated_at) return { at: row.updated_at, source: "contacts.apollo_id" };
        }
        if (slug === "supabase") {
            // The query you're reading right now succeeded → "now" is the
            // freshest signal we have. Avoid an extra round-trip.
            return { at: new Date().toISOString(), source: "this request" };
        }
        if (slug === "meta-capi") {
            // No domain table tracks CAPI sends; fall through to "—" + the
            // hourly probe timestamp surfaced separately.
            return { at: null, source: null };
        }
    } catch {
        // Soft-fail — never crash the list endpoint on a derived-recency lookup.
    }
    return { at: null, source: null };
}

export async function GET(_req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = db();

    const { data: rows } = await sb
        .from("api_connectors")
        .select("id, slug, label, env_var_name, category, enabled, rotation_days, expires_at, docs_url, rotate_url, notes, last_check_at, last_status, last_detail, consecutive_fails")
        .order("category", { ascending: true })
        .order("label", { ascending: true });

    const bySlug = new Map<string, ConnectorRow>();
    for (const r of ((rows || []) as ConnectorRow[])) bySlug.set(r.slug, r);

    // Open alerts grouped by connector for the per-row counter.
    const { data: openAlerts } = await sb
        .from("health_alerts")
        .select("connector_slug")
        .is("resolved_at", null);
    const alertCount = new Map<string, number>();
    for (const a of ((openAlerts || []) as Array<{ connector_slug: string }>)) {
        alertCount.set(a.connector_slug, (alertCount.get(a.connector_slug) || 0) + 1);
    }

    // Build the canonical list in the requested order. Anything in the registry
    // not in REQUIRED_SLUGS gets appended at the end so all connectors are
    // visible — the list is a superset, not a filter.
    const seen = new Set<string>();
    const list: IntegrationSummary[] = [];

    async function pushRow(slug: string, fallback?: Partial<IntegrationSummary>) {
        if (seen.has(slug)) return;
        seen.add(slug);
        const row = bySlug.get(slug);
        const envVar = row?.env_var_name || fallback?.env_var_name || "";
        const configured = envVar ? !!process.env[envVar] : false;
        const daysLeft = daysUntilExpiry(row?.expires_at ?? null);
        const { at: lastOk, source } = await deriveLastSuccess(sb, slug);
        list.push({
            slug,
            label: row?.label || fallback?.label || slug,
            env_var_name: envVar,
            configured,
            last_status: row?.last_status ?? null,
            last_check_at: row?.last_check_at ?? null,
            last_detail: row?.last_detail ?? null,
            days_until_expiry: daysLeft,
            rotation_warn: daysLeft !== null && daysLeft <= EXPIRY_WARN_DAYS,
            rotation_days: row?.rotation_days ?? null,
            expires_at: row?.expires_at ?? null,
            docs_url: row?.docs_url ?? null,
            rotate_url: row?.rotate_url ?? null,
            has_probe: !!probes[slug],
            consecutive_fails: row?.consecutive_fails ?? 0,
            last_success_at: lastOk,
            last_success_source: source,
            open_alert_count: alertCount.get(slug) || 0,
        });
    }

    // Required slugs first, in the requested order.
    for (const s of REQUIRED_SLUGS) {
        if (s === "linkedin") {
            // No registry row — LinkedIn isn't wired yet. Render the placeholder
            // so the operator can see it's a tracked-but-pending integration.
            await pushRow("linkedin", { label: "LinkedIn (Marketing API)", env_var_name: "LINKEDIN_ACCESS_TOKEN" });
            continue;
        }
        await pushRow(s);
    }
    // Everything else in the registry (HubSpot variants, VPS services, etc.).
    for (const slug of Array.from(bySlug.keys())) await pushRow(slug);

    return NextResponse.json({
        integrations: list,
        generated_at: new Date().toISOString(),
    });
}
