import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin, assertAdminWithUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/integrations/test?service=<slug>
 *
 * Pings each service's simplest read endpoint. Returns
 *   { ok: true,  service, latency_ms, status_code, detail }
 * or
 *   { ok: false, service, latency_ms, status_code, error }
 *
 * Admin-only. Each successful run is appended to client_activity_log under
 * the admin's own user_profile_id so the audit trail stays consistent with
 * other admin actions (see CLAUDE.md "Phase 1 — security hotfix").
 *
 * SERVICE WHITELIST (anything outside this list returns 400 — never trust
 * client-supplied identifiers, especially when we use them to dispatch
 * fetch calls to external hosts):
 *
 *   stripe     — GET /v1/balance
 *   resend     — GET /domains
 *   hubspot    — GET /account-info/v3/details
 *   apollo     — GET /api/v1/auth/health
 *   sam        — GET /opportunities/v2/search?limit=1 (KEY 1)
 *   openai     — GET /v1/models
 *   meta_capi  — GET graph.facebook.com/v21.0/me
 *   linkedin   — GET /v2/me
 *   supabase   — HEAD count on opportunities via service key
 */

type ServiceSlug =
    | "stripe"
    | "resend"
    | "hubspot"
    | "apollo"
    | "sam"
    | "openai"
    | "meta_capi"
    | "linkedin"
    | "supabase";

const SERVICE_WHITELIST: ReadonlySet<ServiceSlug> = new Set<ServiceSlug>([
    "stripe",
    "resend",
    "hubspot",
    "apollo",
    "sam",
    "openai",
    "meta_capi",
    "linkedin",
    "supabase",
]);

type TestResult = {
    service: ServiceSlug;
    latency_ms: number;
    status_code: number | null;
    /** Human-readable signal — e.g. "configured", "auth failed (HTTP 401)" */
    detail?: string;
    /** Only present when the probe could not authenticate / reach the host. */
    error?: string;
};

const HTTP_TIMEOUT_MS = 8_000;

/**
 * Wrap fetch with a timeout + uniform error shape so individual probes
 * stay short. Returns either a Response or { error } (never throws).
 */
async function timedFetch(
    url: string,
    init?: RequestInit,
): Promise<{ res: Response; ms: number } | { error: string; ms: number; status_code: null }> {
    const started = Date.now();
    try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
        return { res, ms: Date.now() - started };
    } catch (e) {
        return {
            error: (e as Error).name === "TimeoutError"
                ? `network timeout after ${HTTP_TIMEOUT_MS}ms`
                : `network error: ${(e as Error).message}`,
            ms: Date.now() - started,
            status_code: null,
        };
    }
}

function envMissing(service: ServiceSlug, envVar: string): TestResult {
    return {
        service,
        latency_ms: 0,
        status_code: null,
        error: `${envVar} not configured`,
    };
}

async function probeStripe(): Promise<TestResult> {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return envMissing("stripe", "STRIPE_SECRET_KEY");
    const out = await timedFetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${key}` },
    });
    if ("error" in out) return { service: "stripe", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "stripe",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "balance endpoint reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `Stripe returned HTTP ${out.res.status}`,
    };
}

async function probeResend(): Promise<TestResult> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return envMissing("resend", "RESEND_API_KEY");
    const out = await timedFetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
    });
    if ("error" in out) return { service: "resend", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "resend",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "domains list reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `Resend returned HTTP ${out.res.status}`,
    };
}

async function probeHubspot(): Promise<TestResult> {
    const token = process.env.HUBSPOT_API_KEY
        || process.env.HUBSPOT_ACCESS_TOKEN
        || process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!token) return envMissing("hubspot", "HUBSPOT_API_KEY (or HUBSPOT_ACCESS_TOKEN / HUBSPOT_PRIVATE_APP_TOKEN)");
    const out = await timedFetch("https://api.hubapi.com/account-info/v3/details", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if ("error" in out) return { service: "hubspot", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "hubspot",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "account-info reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `HubSpot returned HTTP ${out.res.status}`,
    };
}

async function probeApollo(): Promise<TestResult> {
    const key = process.env.APOLLO_API_KEY;
    if (!key) return envMissing("apollo", "APOLLO_API_KEY");
    const out = await timedFetch("https://api.apollo.io/api/v1/auth/health", {
        headers: { "X-Api-Key": key },
    });
    if ("error" in out) return { service: "apollo", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "apollo",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "auth/health ok" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `Apollo returned HTTP ${out.res.status}`,
    };
}

async function probeSam(): Promise<TestResult> {
    const key = process.env.SAM_API_KEY;
    if (!key) return envMissing("sam", "SAM_API_KEY");
    const today = new Date();
    const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
    const out = await timedFetch(
        `https://api.sam.gov/opportunities/v2/search?postedFrom=${dateStr}&postedTo=${dateStr}&limit=1`,
        { headers: { "X-Api-Key": key } },
    );
    if ("error" in out) return { service: "sam", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "sam",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "opportunities search reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `SAM.gov returned HTTP ${out.res.status}`,
    };
}

async function probeOpenAi(): Promise<TestResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return envMissing("openai", "OPENAI_API_KEY");
    const out = await timedFetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
    });
    if ("error" in out) return { service: "openai", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "openai",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "models list reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `OpenAI returned HTTP ${out.res.status}`,
    };
}

async function probeMetaCapi(): Promise<TestResult> {
    const token = process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!token) return envMissing("meta_capi", "META_CAPI_TOKEN");
    const out = await timedFetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
    if ("error" in out) return { service: "meta_capi", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "meta_capi",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "graph /me reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `Meta Graph returned HTTP ${out.res.status}`,
    };
}

async function probeLinkedin(): Promise<TestResult> {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    if (!token) return envMissing("linkedin", "LINKEDIN_ACCESS_TOKEN");
    const out = await timedFetch("https://api.linkedin.com/v2/me", {
        headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": "202401" },
    });
    if ("error" in out) return { service: "linkedin", latency_ms: out.ms, status_code: null, error: out.error };
    return {
        service: "linkedin",
        latency_ms: out.ms,
        status_code: out.res.status,
        detail: out.res.ok ? "/v2/me reachable" : `HTTP ${out.res.status}`,
        error: out.res.ok ? undefined : `LinkedIn returned HTTP ${out.res.status}`,
    };
}

async function probeSupabase(): Promise<TestResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return envMissing("supabase", "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY");
    const started = Date.now();
    try {
        const admin = createClient(url, key, { auth: { persistSession: false } });
        const { error, count } = await admin
            .from("opportunities")
            .select("notice_id", { count: "estimated", head: true });
        const ms = Date.now() - started;
        if (error) {
            return {
                service: "supabase",
                latency_ms: ms,
                status_code: null,
                error: error.message,
            };
        }
        return {
            service: "supabase",
            latency_ms: ms,
            status_code: 200,
            detail: `opportunities reachable (~${count ?? "?"} rows)`,
        };
    } catch (e) {
        return {
            service: "supabase",
            latency_ms: Date.now() - started,
            status_code: null,
            error: (e as Error).message,
        };
    }
}

const PROBES: Record<ServiceSlug, () => Promise<TestResult>> = {
    stripe: probeStripe,
    resend: probeResend,
    hubspot: probeHubspot,
    apollo: probeApollo,
    sam: probeSam,
    openai: probeOpenAi,
    meta_capi: probeMetaCapi,
    linkedin: probeLinkedin,
    supabase: probeSupabase,
};

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    // assertAdmin already gated; this second call is solely to recover the
    // caller's user id for the audit log. It's cheap (cookie + one row read)
    // and keeps the contract identical to other admin handlers.
    const who = await assertAdminWithUser();
    if (!who.ok) return who.response;

    // Service can come from ?service=... OR { service } in the body. Query
    // string is the documented shape; body is accepted for parity with the
    // rest of /api/admin/* which mostly POSTs JSON.
    const urlObj = new URL(req.url);
    let service = (urlObj.searchParams.get("service") || "").trim().toLowerCase();
    if (!service) {
        try {
            const body = await req.json();
            if (body && typeof body.service === "string") service = body.service.trim().toLowerCase();
        } catch {
            // No body / not JSON — fall through to the validation error below.
        }
    }

    if (!service) {
        return NextResponse.json(
            { ok: false, error: "Missing `service` (query param or body)." },
            { status: 400 },
        );
    }
    if (!SERVICE_WHITELIST.has(service as ServiceSlug)) {
        return NextResponse.json(
            {
                ok: false,
                error: `Unknown service "${service}". Allowed: ${Array.from(SERVICE_WHITELIST).join(", ")}`,
            },
            { status: 400 },
        );
    }

    const slug = service as ServiceSlug;
    let result: TestResult;
    try {
        result = await PROBES[slug]();
    } catch (e) {
        // Defense-in-depth — individual probes already catch, but a programming
        // error inside a probe shouldn't 500 the whole admin panel.
        result = {
            service: slug,
            latency_ms: 0,
            status_code: null,
            error: `probe crashed: ${(e as Error).message}`,
        };
    }

    const ok = !result.error;

    // Audit log — record every probe attempt so we have a trail of who
    // tested what (and when a failing key first showed red). Soft-fail: a
    // logging error must not mask the actual probe result.
    try {
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
            { auth: { persistSession: false } },
        );

        // client_activity_log.user_profile_id is NOT NULL, so we tag the
        // admin's own profile row as the subject of the action.
        const { data: profile } = await admin
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", who.userId)
            .maybeSingle();

        const profileId = (profile as { id: string } | null)?.id;
        if (profileId) {
            await admin.from("client_activity_log").insert({
                user_profile_id: profileId,
                actor_id: who.userId,
                action: "integration_test",
                description: ok
                    ? `Tested integration "${slug}" — OK (${result.latency_ms}ms)`
                    : `Tested integration "${slug}" — FAIL: ${result.error}`,
                metadata: {
                    service: slug,
                    latency_ms: result.latency_ms,
                    status_code: result.status_code,
                    detail: result.detail ?? null,
                    error: result.error ?? null,
                    actor_email: who.email,
                },
            });
        }
    } catch (logErr) {
        console.error("[integrations/test] audit-log insert failed:", logErr);
    }

    return NextResponse.json(
        ok
            ? {
                ok: true,
                service: slug,
                latency_ms: result.latency_ms,
                status_code: result.status_code,
                detail: result.detail,
            }
            : {
                ok: false,
                service: slug,
                latency_ms: result.latency_ms,
                status_code: result.status_code,
                error: result.error,
            },
    );
}

/**
 * GET /api/admin/integrations/test
 * Returns the whitelist so the admin UI knows which buttons to render
 * without hard-coding the list in two places.
 */
export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    return NextResponse.json({
        ok: true,
        services: Array.from(SERVICE_WHITELIST),
    });
}
