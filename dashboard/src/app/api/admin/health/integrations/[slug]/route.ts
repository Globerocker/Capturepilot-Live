import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { daysUntilExpiry, EXPIRY_WARN_DAYS, probes, type ProbeResult } from "@/lib/connectors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET  /api/admin/health/integrations/[slug]
 *   Returns deep state for one connector: registry row + recent alerts +
 *   recent calls (best-effort) + sample payload from the matching domain
 *   table. No live probe — see POST below.
 *
 * POST /api/admin/health/integrations/[slug]
 *   Body: { action: "test" }
 *   Runs the registered probe function from `src/lib/connectors.ts`, persists
 *   the result back to api_connectors (so the list view picks it up too),
 *   returns { status, detail, checked_at }. Falls back to "no probe defined"
 *   for slugs without a registry probe (e.g. LinkedIn placeholder).
 */

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

type Alert = {
    id: string;
    alert_type: string;
    severity: string;
    title: string;
    detail: string | null;
    fired_at: string;
    resolved_at: string | null;
};

type SamplePayload = {
    source: string;
    captured_at: string | null;
    body: unknown;
} | null;

/**
 * Pull a representative "last call payload" from a domain table per slug.
 * We never store request/response bodies wholesale (PII + cost), but most of
 * our integration tables carry enough metadata to prove a call happened and
 * show the operator the shape of the most recent successful interaction.
 */
async function fetchSamplePayload(sb: ReturnType<typeof db>, slug: string): Promise<SamplePayload> {
    try {
        if (slug === "resend") {
            const { data } = await sb
                .from("email_events")
                .select("event_type, recipient, occurred_at, raw")
                .order("occurred_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { event_type: string; recipient: string | null; occurred_at: string; raw: unknown } | null;
            if (row) return { source: "email_events (latest)", captured_at: row.occurred_at, body: row };
        }
        if (slug === "hubspot") {
            const { data } = await sb
                .from("marketing_leads")
                .select("id, email, inferred_profile, updated_at")
                .not("inferred_profile", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { id: string; email: string; inferred_profile: Record<string, unknown>; updated_at: string } | null;
            if (row) {
                // Redact obvious PII from the email field — show only the domain.
                const domain = (row.email || "").split("@")[1] || "—";
                return {
                    source: "marketing_leads (latest)",
                    captured_at: row.updated_at,
                    body: {
                        lead_id: row.id,
                        email_domain: domain,
                        sync_keys: Object.keys(row.inferred_profile || {}).filter(k => k.startsWith("synced_") || k.startsWith("hubspot_")),
                    },
                };
            }
        }
        if (slug === "stripe") {
            const { data } = await sb
                .from("user_profiles")
                .select("stripe_customer_id, stripe_subscription_id, updated_at")
                .not("stripe_customer_id", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { stripe_customer_id: string; stripe_subscription_id: string | null; updated_at: string } | null;
            if (row) {
                // Redact full IDs — keep the prefix so the operator can confirm
                // they're real Stripe identifiers without leaking the actual key.
                return {
                    source: "user_profiles (latest subscription)",
                    captured_at: row.updated_at,
                    body: {
                        customer_id_prefix: row.stripe_customer_id.slice(0, 12) + "…",
                        subscription_id_prefix: row.stripe_subscription_id ? row.stripe_subscription_id.slice(0, 12) + "…" : null,
                        updated_at: row.updated_at,
                    },
                };
            }
        }
        if (slug === "sam-gov") {
            const { data } = await sb
                .from("cron_runs")
                .select("route, started_at, finished_at, status, payload")
                .like("route", "%ingest_sam%")
                .order("started_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (data) return { source: "cron_runs.ingest_sam (latest)", captured_at: (data as { started_at: string }).started_at, body: data };
        }
        if (slug === "openai") {
            const { data } = await sb
                .from("opportunities")
                .select("notice_id, ai_win_strategy, updated_at")
                .not("ai_win_strategy", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as { notice_id: string; ai_win_strategy: string; updated_at: string } | null;
            if (row) {
                return {
                    source: "opportunities.ai_win_strategy (latest)",
                    captured_at: row.updated_at,
                    body: {
                        notice_id: row.notice_id,
                        preview: row.ai_win_strategy.slice(0, 240),
                        length: row.ai_win_strategy.length,
                    },
                };
            }
        }
        if (slug === "apollo") {
            const { data } = await sb
                .from("contacts")
                .select("id, apollo_id, title, updated_at")
                .not("apollo_id", "is", null)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (data) return { source: "contacts.apollo_id (latest)", captured_at: (data as { updated_at: string }).updated_at, body: data };
        }
        if (slug === "supabase") {
            return {
                source: "self",
                captured_at: new Date().toISOString(),
                body: { url: process.env.NEXT_PUBLIC_SUPABASE_URL, db_reachable: true },
            };
        }
    } catch {
        // Soft-fail; caller shows "no sample available".
    }
    return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { slug } = await params;
    const sb = db();

    const { data: row } = await sb
        .from("api_connectors")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

    if (!row) {
        // LinkedIn placeholder — render a virtual record so the detail page can
        // still surface "not configured" + the suggested env var.
        if (slug === "linkedin") {
            return NextResponse.json({
                connector: {
                    slug,
                    label: "LinkedIn (Marketing API)",
                    env_var_name: "LINKEDIN_ACCESS_TOKEN",
                    category: "integration",
                    enabled: false,
                    rotation_days: 60,
                    expires_at: null,
                    docs_url: "https://learn.microsoft.com/linkedin/marketing/",
                    rotate_url: "https://www.linkedin.com/developers/apps",
                    notes: "Not wired yet. Add LINKEDIN_ACCESS_TOKEN to enable lead-form sync. LinkedIn access tokens expire every 60 days unless refreshed.",
                    last_check_at: null,
                    last_status: null,
                    last_detail: null,
                    consecutive_fails: 0,
                    configured: !!process.env.LINKEDIN_ACCESS_TOKEN,
                    days_until_expiry: null,
                    rotation_warn: false,
                    has_probe: false,
                },
                alerts: [],
                sample: null,
                last_success_at: null,
            });
        }
        return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const connector = row as {
        slug: string; env_var_name: string; expires_at: string | null;
        last_status: string | null; last_check_at: string | null;
        [k: string]: unknown;
    };

    const { data: alertsData } = await sb
        .from("health_alerts")
        .select("id, alert_type, severity, title, detail, fired_at, resolved_at")
        .eq("connector_slug", slug)
        .order("fired_at", { ascending: false })
        .limit(20);

    const sample = await fetchSamplePayload(sb, slug);

    const daysLeft = daysUntilExpiry(connector.expires_at);

    return NextResponse.json({
        connector: {
            ...connector,
            configured: !!process.env[connector.env_var_name],
            days_until_expiry: daysLeft,
            rotation_warn: daysLeft !== null && daysLeft <= EXPIRY_WARN_DAYS,
            has_probe: !!probes[slug],
        },
        alerts: (alertsData || []) as Alert[],
        sample,
        last_success_at: sample?.captured_at ?? null,
    });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { slug } = await params;

    let body: { action?: string } = {};
    try { body = await req.json(); } catch { body = {}; }

    if (body.action !== "test") {
        return NextResponse.json({ error: "Unknown action — use { action: 'test' }" }, { status: 400 });
    }

    const probe = probes[slug];
    if (!probe) {
        return NextResponse.json({
            status: "unknown",
            detail: "No probe registered for this connector. Add it to src/lib/connectors.ts.",
            checked_at: new Date().toISOString(),
        });
    }

    const started = Date.now();
    let result: ProbeResult;
    try {
        result = await probe();
    } catch (e) {
        result = { status: "error", detail: `probe threw: ${(e as Error).message}` };
    }
    const elapsedMs = Date.now() - started;
    const checkedAt = new Date().toISOString();

    // Persist back to api_connectors so the list view picks up the latest probe
    // without re-running it. Mirror the health_monitor cron's behaviour:
    // bump consecutive_fails on error, reset on success.
    try {
        const sb = db();
        const { data: existing } = await sb
            .from("api_connectors")
            .select("consecutive_fails")
            .eq("slug", slug)
            .maybeSingle();
        const prevFails = ((existing as { consecutive_fails: number } | null)?.consecutive_fails) ?? 0;
        const nextFails = result.status === "error" ? prevFails + 1 : 0;
        await sb
            .from("api_connectors")
            .update({
                last_check_at: checkedAt,
                last_status: result.status,
                last_detail: result.detail ?? null,
                consecutive_fails: nextFails,
                updated_at: checkedAt,
            })
            .eq("slug", slug);
    } catch {
        // Persistence failure shouldn't hide the live probe result from the operator.
    }

    return NextResponse.json({
        status: result.status,
        detail: result.detail,
        elapsed_ms: elapsedMs,
        checked_at: checkedAt,
    });
}
