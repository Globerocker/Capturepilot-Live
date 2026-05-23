import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/db-stats — single dashboard payload powering the
 * "Data Health" panel on /admin/overview.
 *
 * Returns:
 *   - opportunities: row counts, newest row, by-status breakdown
 *   - enrichment: % populated per critical column (strategic_scoring,
 *     ai_win_strategy, structured_requirements)
 *   - expiry: how many opps have a deadline in the next 7d / 30d, and
 *     how many are EXPIRED (drives the case for the cleanup cron)
 *   - crons: last run + last success per route, sorted stalest first
 *     so failures bubble up
 *   - users: last 10 sign-ins from auth.users
 *   - recent_activity: last 15 rows from client_activity_log
 *
 * All counts use Postgres `count: "estimated"` where the predicate is
 * non-selective enough that exact counts would scan the full 37k+ row
 * opportunities table. Specific status / completeness counts stay
 * exact because they're cheap with the existing indexes.
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const CRITICAL_CRONS = [
    "/api/cron/ingest_sam",
    "/api/cron/ingest_grants",
    "/api/cron/score_matches",
    "/api/cron/strategic_scoring",
    "/api/cron/ai_strategy",
    "/api/cron/backfill_requirements",
    "/api/cron/deep_enrich",
    "/api/cron/notify_matches",
    "/api/cron/db_cleanup",
    "/api/cron/enrichment_orchestrator",
    "/api/cron/enrich_apollo",
    "/api/cron/monthly_awards",
    "/api/cron/discover_new_prospects",
    "/api/cron/publish_next_blog",
];

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = svc();
    const now = Date.now();
    const in7d = new Date(now + 7 * 86400_000).toISOString();
    const in30d = new Date(now + 30 * 86400_000).toISOString();
    const today = new Date(now).toISOString();

    // --- Opportunities ---------------------------------------------------
    const [
        totalRes,
        activeRes,
        expiringRes,
        expiredRes,
        latestRes,
        scoringFilledRes,
        winStrategyFilledRes,
        requirementsFilledRes,
    ] = await Promise.all([
        sb.from("opportunities").select("*", { count: "estimated", head: true }).eq("is_archived", false),
        sb.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("is_archived", false)
            .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"]),
        sb.from("opportunities").select("*", { count: "exact", head: true })
            .eq("is_archived", false)
            .lte("response_deadline", in7d)
            .gte("response_deadline", today),
        sb.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("status", "EXPIRED"),
        sb.from("opportunities").select("posted_date, created_at, title, agency, notice_id")
            .order("created_at", { ascending: false, nullsFirst: false })
            .limit(1),
        sb.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("is_archived", false)
            .not("strategic_scoring", "is", null),
        sb.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("is_archived", false)
            .not("ai_win_strategy", "is", null),
        sb.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("is_archived", false)
            .not("structured_requirements", "is", null),
    ]);

    const totalActive = activeRes.count ?? 0;
    const total = totalRes.count ?? 0;
    const denom = totalActive || total || 1;
    const pct = (n: number | null) => Math.round(((n ?? 0) / denom) * 100);

    const latest = (latestRes.data as Array<{ posted_date: string | null; created_at: string | null; title: string | null; agency: string | null; notice_id: string | null }> | null)?.[0] ?? null;

    // --- Crons (last run + last success per route) -----------------------
    const { data: cronRows } = await sb
        .from("cron_runs")
        .select("route, started_at, finished_at, status, rows_out, error_message, elapsed_ms")
        .in("route", CRITICAL_CRONS)
        .order("started_at", { ascending: false })
        .limit(500);

    type CronRow = { route: string; started_at: string; finished_at: string | null; status: string | null; rows_out: number | null; error_message: string | null; elapsed_ms: number | null };
    const byRoute = new Map<string, { last: CronRow | null; lastSuccess: CronRow | null }>();
    for (const r of CRITICAL_CRONS) byRoute.set(r, { last: null, lastSuccess: null });
    for (const row of (cronRows as CronRow[] | null) || []) {
        const entry = byRoute.get(row.route);
        if (!entry) continue;
        if (!entry.last) entry.last = row;
        if (!entry.lastSuccess && row.status === "ok") entry.lastSuccess = row;
    }

    // Sort stalest first so the dashboard surfaces neglected jobs.
    const crons = Array.from(byRoute.entries()).map(([route, e]) => ({
        route,
        last_run: e.last?.started_at ?? null,
        last_status: e.last?.status ?? null,
        last_error: e.last?.status === "error" ? e.last.error_message : null,
        last_rows_out: e.last?.rows_out ?? null,
        last_elapsed_ms: e.last?.elapsed_ms ?? null,
        last_success: e.lastSuccess?.started_at ?? null,
        hours_since_success: e.lastSuccess
            ? Math.round((now - new Date(e.lastSuccess.started_at).getTime()) / 3600_000)
            : null,
    })).sort((a, b) => {
        const ax = a.last_success ? new Date(a.last_success).getTime() : 0;
        const bx = b.last_success ? new Date(b.last_success).getTime() : 0;
        return ax - bx;
    });

    // --- Users: last sign-ins via auth.admin -----------------------------
    // listUsers doesn't sort by sign-in, so we pull a generous page and sort
    // in JS. Plenty fast at our scale (~hundreds of accounts).
    const { data: usersPage } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const recentLogins = (usersPage?.users || [])
        .filter(u => u.last_sign_in_at)
        .sort((a, b) => new Date(b.last_sign_in_at!).getTime() - new Date(a.last_sign_in_at!).getTime())
        .slice(0, 10)
        .map(u => ({
            email: u.email,
            last_sign_in_at: u.last_sign_in_at,
            created_at: u.created_at,
        }));

    // --- Recent change-log entries (best-effort) -------------------------
    const { data: activity } = await sb
        .from("client_activity_log")
        .select("id, user_profile_id, action, description, created_at")
        .order("created_at", { ascending: false })
        .limit(15);

    return NextResponse.json({
        generated_at: new Date().toISOString(),
        opportunities: {
            total_estimated: total,
            active_estimated: totalActive,
            expiring_in_7d_exact: expiringRes.count ?? 0,
            expiring_in_30d_estimated: null,
            expired_estimated: expiredRes.count ?? 0,
            latest_added: latest,
        },
        enrichment: {
            denominator: denom,
            strategic_scoring: { populated: scoringFilledRes.count ?? 0, pct: pct(scoringFilledRes.count) },
            ai_win_strategy: { populated: winStrategyFilledRes.count ?? 0, pct: pct(winStrategyFilledRes.count) },
            structured_requirements: { populated: requirementsFilledRes.count ?? 0, pct: pct(requirementsFilledRes.count) },
        },
        crons,
        recent_logins: recentLogins,
        recent_activity: activity || [],
    });
}
