import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * Static catalog of scheduled Vercel cron routes. Mirrors `vercel.json` so the
 * admin overview can show the same list even when no run history exists yet.
 */
const CRON_CATALOG: { path: string; name: string; schedule: string; description: string }[] = [
    { path: "/api/cron/ingest_sam", name: "ingest_sam", schedule: "0 2 * * *", description: "Fetch new SAM.gov opportunities" },
    { path: "/api/cron/ingest_grants", name: "ingest_grants", schedule: "30 2 * * *", description: "Fetch Grants.gov opportunities" },
    { path: "/api/cron/score_matches", name: "score_matches", schedule: "0 3 * * *", description: "Score opportunities for all users" },
    { path: "/api/cron/strategic_scoring", name: "strategic_scoring", schedule: "30 3 * * *", description: "Strategic deterministic scoring" },
    { path: "/api/cron/db_cleanup", name: "db_cleanup", schedule: "0 4 * * 0", description: "Lifecycle management" },
    { path: "/api/cron/enrich", name: "enrich", schedule: "0 5 * * *", description: "Contractor enrichment orchestrator" },
    { path: "/api/cron/enrich_contractors", name: "enrich_contractors", schedule: "30 5 * * *", description: "Contractor enrichment" },
    { path: "/api/cron/enrich_apollo", name: "enrich_apollo", schedule: "0 6 * * *", description: "Apollo enrichment pass" },
    { path: "/api/cron/backfill_requirements", name: "backfill_requirements", schedule: "30 6 * * *", description: "Extract requirements from raw_json" },
    { path: "/api/cron/competitor_monitor", name: "competitor_monitor", schedule: "0 7 * * 0", description: "Crawl competitor websites" },
    { path: "/api/cron/deep_enrich", name: "deep_enrich", schedule: "0 8 * * *", description: "Descriptions + PDFs + requirements" },
    { path: "/api/cron/ai_strategy", name: "ai_strategy", schedule: "0 9 * * *", description: "AI win strategy generation" },
    { path: "/api/cron/notify_matches", name: "notify_matches", schedule: "0 10 * * *", description: "Email opportunity alerts" },
    { path: "/api/cron/process_scheduled_emails", name: "process_scheduled_emails", schedule: "*/15 * * * *", description: "Drip email sender" },
    { path: "/api/cron/trial_reminders", name: "trial_reminders", schedule: "0 14 * * *", description: "Trial expiry reminders" },
    { path: "/api/cron/beta_deadline", name: "beta_deadline", schedule: "0 13 * * *", description: "Beta deadline reminders" },
    { path: "/api/cron/monthly_awards", name: "monthly_awards", schedule: "0 0 1 * *", description: "Award + forecast notices" },
];

type Throughput = { last5min: number; last30min: number; last60min: number };

async function tableExists(admin: ReturnType<typeof getAdmin>, name: string): Promise<boolean> {
    const { error } = await admin.from(name).select("*", { head: true, count: "exact" }).limit(1);
    return !error;
}

/**
 * GET /api/admin/jobs?tab=<crons|worker|email|attachment|rescore>
 *
 * Returns aggregated job state for the requested tab. Each tab fetches its
 * own slice so we don't ship one huge payload every 10s.
 */
export async function GET(req: NextRequest) {
    const tab = req.nextUrl.searchParams.get("tab") || "crons";
    const admin = getAdmin();
    const now = Date.now();

    try {
        if (tab === "crons") {
            // cron_runs table may not exist on every deploy — fall back to the
            // static catalog with empty stats.
            const hasCronRuns = await tableExists(admin, "cron_runs");
            const rows = CRON_CATALOG.map((c) => ({
                ...c,
                last_run: null as string | null,
                last_status: null as string | null,
                runs_7d: 0,
                last_duration_ms: null as number | null,
            }));

            if (hasCronRuns) {
                const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
                const { data } = await admin
                    .from("cron_runs")
                    .select("route, status, started_at, finished_at, duration_ms")
                    .gte("started_at", sevenDaysAgo)
                    .order("started_at", { ascending: false });

                const byRoute = new Map<string, { last_run: string; last_status: string; runs_7d: number; last_duration_ms: number | null }>();
                for (const r of (data || []) as Array<{ route: string; status: string; started_at: string; duration_ms: number | null }>) {
                    const existing = byRoute.get(r.route);
                    if (!existing) {
                        byRoute.set(r.route, { last_run: r.started_at, last_status: r.status, runs_7d: 1, last_duration_ms: r.duration_ms });
                    } else {
                        existing.runs_7d += 1;
                    }
                }
                for (const row of rows) {
                    const stats = byRoute.get(row.path) || byRoute.get(row.name);
                    if (stats) {
                        row.last_run = stats.last_run;
                        row.last_status = stats.last_status;
                        row.runs_7d = stats.runs_7d;
                        row.last_duration_ms = stats.last_duration_ms;
                    }
                }
            }

            return NextResponse.json({ rows, has_history: hasCronRuns });
        }

        if (tab === "worker") {
            const hasWorker = await tableExists(admin, "worker_jobs");
            if (!hasWorker) return NextResponse.json({ rows: [], throughput: emptyThroughput(), table_missing: true });

            const { data: counts } = await admin
                .from("worker_jobs")
                .select("task_type, status", { count: "exact" });

            const grouped = new Map<string, { task_type: string; pending: number; running: number; done: number; failed: number; total: number }>();
            for (const r of (counts || []) as Array<{ task_type: string; status: string }>) {
                const key = r.task_type || "unknown";
                const g = grouped.get(key) || { task_type: key, pending: 0, running: 0, done: 0, failed: 0, total: 0 };
                if (r.status === "pending") g.pending += 1;
                else if (r.status === "running") g.running += 1;
                else if (r.status === "done") g.done += 1;
                else if (r.status === "failed") g.failed += 1;
                g.total += 1;
                grouped.set(key, g);
            }

            const throughput = await computeThroughput(admin, "worker_jobs", "finished_at");
            return NextResponse.json({ rows: Array.from(grouped.values()), throughput });
        }

        if (tab === "email") {
            const sinceHour = new Date(now - 60 * 60 * 1000).toISOString();
            const { data: recent } = await admin
                .from("scheduled_emails")
                .select("id, email_address, template_key, sequence_key, status, scheduled_for, sent_at, failure_reason")
                .order("scheduled_for", { ascending: false })
                .limit(25);

            const { count: pendingCount } = await admin
                .from("scheduled_emails")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending")
                .is("sent_at", null);

            const { count: failedCount } = await admin
                .from("scheduled_emails")
                .select("id", { count: "exact", head: true })
                .eq("status", "failed");

            const { count: sentLastHour } = await admin
                .from("scheduled_emails")
                .select("id", { count: "exact", head: true })
                .eq("status", "sent")
                .gte("sent_at", sinceHour);

            const throughput = await computeThroughput(admin, "scheduled_emails", "sent_at");

            return NextResponse.json({
                rows: recent || [],
                counts: { pending: pendingCount || 0, failed: failedCount || 0, sent_last_hour: sentLastHour || 0 },
                throughput,
            });
        }

        if (tab === "attachment") {
            const hasJobs = await tableExists(admin, "attachment_analysis_jobs");
            if (!hasJobs) return NextResponse.json({ rows: [], counts: { pending: 0, running: 0, completed: 0, failed: 0 }, throughput: emptyThroughput(), table_missing: true });

            const { data: recent } = await admin
                .from("attachment_analysis_jobs")
                .select("id, notice_id, status, files_total, files_done, current_file, error, created_at, completed_at")
                .order("created_at", { ascending: false })
                .limit(25);

            const all = (recent || []) as Array<{ status: string }>;
            const counts = {
                pending: all.filter((r) => r.status === "pending").length,
                running: all.filter((r) => r.status === "downloading" || r.status === "extracting").length,
                completed: all.filter((r) => r.status === "completed").length,
                failed: all.filter((r) => r.status === "failed").length,
            };

            const throughput = await computeThroughput(admin, "attachment_analysis_jobs", "completed_at");
            return NextResponse.json({ rows: recent || [], counts, throughput });
        }

        if (tab === "rescore") {
            // Rescore queue may be modeled as proposal_jobs (background generation)
            // or as a dedicated rescore_jobs table on later migrations. Fall back gracefully.
            const hasRescore = await tableExists(admin, "rescore_jobs");
            const table = hasRescore ? "rescore_jobs" : "proposal_jobs";

            const { data: recent } = await admin
                .from(table)
                .select("id, user_profile_id, status, current_section, completed_sections, total_sections, error, created_at, completed_at")
                .order("created_at", { ascending: false })
                .limit(25);

            const all = (recent || []) as Array<{ status: string }>;
            const counts = {
                pending: all.filter((r) => r.status === "pending").length,
                running: all.filter((r) => r.status === "writing" || r.status === "running").length,
                completed: all.filter((r) => r.status === "completed").length,
                failed: all.filter((r) => r.status === "failed").length,
            };

            const throughput = await computeThroughput(admin, table, "completed_at");
            return NextResponse.json({ rows: recent || [], counts, throughput, table });
        }

        return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

function emptyThroughput(): Throughput {
    return { last5min: 0, last30min: 0, last60min: 0 };
}

async function computeThroughput(
    admin: ReturnType<typeof getAdmin>,
    table: string,
    column: string,
): Promise<Throughput> {
    const now = Date.now();
    const windows = [
        { key: "last5min" as const, since: new Date(now - 5 * 60 * 1000).toISOString() },
        { key: "last30min" as const, since: new Date(now - 30 * 60 * 1000).toISOString() },
        { key: "last60min" as const, since: new Date(now - 60 * 60 * 1000).toISOString() },
    ];
    const out: Throughput = emptyThroughput();
    await Promise.all(
        windows.map(async (w) => {
            const { count } = await admin
                .from(table)
                .select("id", { count: "exact", head: true })
                .gte(column, w.since);
            out[w.key] = count || 0;
        }),
    );
    return out;
}
