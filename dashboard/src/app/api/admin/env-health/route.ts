import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/env-health
 * Returns which production secrets are set + quick reachability checks for the
 * external APIs we depend on. Admin-only.
 *
 * Does NOT return secret values. Only booleans + last-known status per service.
 */

type ServiceStatus = {
    key: string;
    env_var: string;
    configured: boolean;
    reachable: "unknown" | "ok" | "error";
    detail?: string;
    last_check: string;
};

async function probe(url: string, init?: RequestInit): Promise<"ok" | "error" | "unknown"> {
    try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
        if (res.status === 401 || res.status === 403) return "error";
        return res.ok ? "ok" : "error";
    } catch {
        return "error";
    }
}

export async function GET(_req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profile } = await admin.from("user_profiles").select("account_type").eq("auth_user_id", user.id).single();
    if ((profile as { account_type: string } | null)?.account_type !== "admin") {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const checks: ServiceStatus[] = [];

    // OpenAI
    {
        const configured = !!process.env.OPENAI_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            const res = await probe("https://api.openai.com/v1/models", {
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            });
            reachable = res;
        }
        checks.push({ key: "OpenAI", env_var: "OPENAI_API_KEY", configured, reachable, last_check: now });
    }

    // DeepSeek
    {
        const configured = !!process.env.DEEPSEEK_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.deepseek.com/v1/models", {
                headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
            });
        }
        checks.push({ key: "DeepSeek", env_var: "DEEPSEEK_API_KEY", configured, reachable, last_check: now });
    }

    // SAM.gov — probe BOTH keys independently. The split (lib/sam-keys.ts)
    // means opportunities and contractor calls have separate quotas; if KEY 1
    // is 429-ing we still want to know KEY 2 is healthy.
    //
    // Each probe uses the endpoint matching its own scope so it draws against
    // the right quota (1 req against KEY 1, 1 req against KEY 2 — both small).
    {
        const today = new Date();
        const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

        const k1 = process.env.SAM_API_KEY;
        const k1Reachable: ServiceStatus["reachable"] = k1
            ? await probe(
                `https://api.sam.gov/opportunities/v2/search?postedFrom=${dateStr}&postedTo=${dateStr}&limit=1`,
                { headers: { "X-Api-Key": k1 } },
            )
            : "unknown";
        checks.push({ key: "SAM.gov (opportunities)", env_var: "SAM_API_KEY", configured: !!k1, reachable: k1Reachable, last_check: now });

        const k2 = process.env.SAM_API_KEY_2;
        const k2Reachable: ServiceStatus["reachable"] = k2
            ? await probe(
                "https://api.sam.gov/entity-information/v3/entities?registrationStatus=A&size=1",
                { headers: { "X-Api-Key": k2 } },
            )
            : "unknown";
        checks.push({ key: "SAM.gov (contractors)", env_var: "SAM_API_KEY_2", configured: !!k2, reachable: k2Reachable, last_check: now });
    }

    // Apollo
    {
        const configured = !!process.env.APOLLO_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.apollo.io/api/v1/auth/health", {
                headers: { "X-Api-Key": process.env.APOLLO_API_KEY! },
            });
        }
        checks.push({ key: "Apollo.io", env_var: "APOLLO_API_KEY", configured, reachable, last_check: now });
    }

    // Mistral (OCR)
    {
        const configured = !!process.env.MISTRAL_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.mistral.ai/v1/models", {
                headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
            });
        }
        checks.push({ key: "Mistral OCR", env_var: "MISTRAL_API_KEY", configured, reachable, last_check: now });
    }

    // Firecrawl
    {
        const configured = !!process.env.FIRECRAWL_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.firecrawl.dev/v1/scrape", {
                method: "POST",
                headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
            });
        }
        checks.push({ key: "Firecrawl", env_var: "FIRECRAWL_API_KEY", configured, reachable, last_check: now });
    }

    // Resend — list domains is a cheap auth probe
    {
        const configured = !!process.env.RESEND_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.resend.com/domains", {
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            });
        }
        checks.push({ key: "Resend (email)", env_var: "RESEND_API_KEY", configured, reachable, last_check: now });
    }

    // Stripe — /v1/balance is a stable auth probe (only needs the secret key)
    {
        const configured = !!process.env.STRIPE_SECRET_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.stripe.com/v1/balance", {
                headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
            });
        }
        checks.push({ key: "Stripe", env_var: "STRIPE_SECRET_KEY", configured, reachable, last_check: now });
    }

    // Supabase — we already used the admin client above; do a tiny count query
    // to verify the service key works against the DB, not just auth.
    {
        try {
            const { error } = await admin.from("opportunities").select("notice_id", { count: "exact", head: true }).limit(1);
            checks.push({
                key: "Supabase (DB)",
                env_var: "SUPABASE_SERVICE_KEY",
                configured: true,
                reachable: error ? "error" : "ok",
                detail: error ? error.message : undefined,
                last_check: now,
            });
        } catch (e) {
            checks.push({
                key: "Supabase (DB)",
                env_var: "SUPABASE_SERVICE_KEY",
                configured: true,
                reachable: "error",
                detail: (e as Error).message,
                last_check: now,
            });
        }
    }

    // CRON_SECRET (if set, cron routes require it)
    {
        const configured = !!process.env.CRON_SECRET;
        checks.push({
            key: "Cron Secret",
            env_var: "CRON_SECRET",
            configured,
            reachable: "unknown",
            detail: configured ? "Vercel crons must Bearer this" : "Not set — cron routes run unauthenticated",
            last_check: now,
        });
    }

    // Last-run-per-cron summary so the operator can spot stale routes at a
    // glance without bouncing over to /admin/crons.
    type CronStat = { route: string; last_run: string | null; last_status: string | null; runs_7d: number };
    let cronStats: CronStat[] = [];
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const { data: runs } = await admin
            .from("cron_runs")
            .select("route, started_at, status")
            .gte("started_at", sevenDaysAgo)
            .order("started_at", { ascending: false })
            .limit(500);
        if (Array.isArray(runs)) {
            const byRoute = new Map<string, CronStat>();
            for (const r of runs as Array<{ route: string; started_at: string; status: string | null }>) {
                const existing = byRoute.get(r.route);
                if (!existing) {
                    byRoute.set(r.route, { route: r.route, last_run: r.started_at, last_status: r.status, runs_7d: 1 });
                } else {
                    existing.runs_7d += 1;
                    // The first entry per route is the most-recent because we ordered DESC.
                }
            }
            // Sort by stalest last_run first so failing/missing crons surface at the top.
            cronStats = Array.from(byRoute.values()).sort((a, b) => {
                if (!a.last_run) return 1;
                if (!b.last_run) return -1;
                return a.last_run.localeCompare(b.last_run);
            });
        }
    } catch {
        // Soft-fail — the env checks above are the primary signal.
    }

    // Data-quality KPIs surfaced from audit fixes #8 + #9 (2026-06-10):
    //   - ai_win_strategy was null on 81.3% of opportunities (backfill never
    //     finished in April); operator needs a live counter so it can't
    //     regress silently again.
    //   - opportunity_score was null on 100% (78,007/78,007); now produced by
    //     backfill_opportunity_score cron — track the burndown until it hits 0.
    // Both queries cap at is_archived=false so the percentage reflects only
    // the rows we actually surface in the UI.
    type DataQualityKpi = {
        key: string;
        null_pct: number | null;
        null_count: number | null;
        total: number | null;
        detail?: string;
        last_check: string;
    };
    const dataQuality: DataQualityKpi[] = [];
    try {
        const { count: totalCount } = await admin
            .from("opportunities")
            .select("notice_id", { count: "exact", head: true })
            .eq("is_archived", false);
        const total = totalCount ?? null;

        const { count: nullAiWin } = await admin
            .from("opportunities")
            .select("notice_id", { count: "exact", head: true })
            .eq("is_archived", false)
            .is("ai_win_strategy", null);

        // Match the cron's "null OR 0" gap (schema DEFAULT 0; prod shows NULL).
        const { count: nullScore } = await admin
            .from("opportunities")
            .select("notice_id", { count: "exact", head: true })
            .eq("is_archived", false)
            .or("opportunity_score.is.null,opportunity_score.eq.0");

        const pct = (n: number | null) =>
            total && n != null ? Math.round((n / total) * 1000) / 10 : null;

        dataQuality.push({
            key: "null_ai_win_strategy_pct",
            null_pct: pct(nullAiWin ?? null),
            null_count: nullAiWin ?? null,
            total,
            detail: "Audit fix #8 — Apr 16 backfill never finished. Drain via /api/admin/backfill-enrichment.",
            last_check: now,
        });
        dataQuality.push({
            key: "null_opportunity_score_pct",
            null_pct: pct(nullScore ?? null),
            null_count: nullScore ?? null,
            total,
            detail: "Audit fix #9 — backfill_opportunity_score cron drains 5000/run twice daily.",
            last_check: now,
        });
    } catch (e) {
        dataQuality.push({
            key: "data_quality_probe_failed",
            null_pct: null,
            null_count: null,
            total: null,
            detail: (e as Error).message,
            last_check: now,
        });
    }

    return NextResponse.json({ checks, cron_summary: cronStats, data_quality: dataQuality });
}
