import { z } from "zod";

/**
 * Zod contracts for the admin + account APIs that the UI relies on.
 *
 * Two reasons these live here:
 *   1. Runtime validation — handlers can `.parse(body)` to reject malformed
 *      input cleanly with a 400 instead of crashing on Supabase later.
 *   2. Drift detection — the smoke-test suite parses every documented
 *      response against these schemas. If a handler quietly changes shape
 *      the test fails immediately rather than waiting for a UI regression.
 *
 * When you add a new field to a response, add it here in the SAME PR.
 * Marking it `.optional()` is fine if it's not always present.
 */

// ─── Shared primitives ────────────────────────────────────────────────────
export const ProfileIdSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime();
export const AccountTypeSchema = z.enum(["consulting", "self_service", "admin"]);

// ─── /api/admin/clients ───────────────────────────────────────────────────
export const ClientRowSchema = z.object({
    id: ProfileIdSchema,
    auth_user_id: z.string().uuid().nullable(),
    company_name: z.string().nullable(),
    email: z.string().nullable(),
    contact_name: z.string().nullable(),
    contact_phone: z.string().nullable(),
    website: z.string().nullable(),
    uei: z.string().nullable(),
    cage_code: z.string().nullable(),
    naics_codes: z.array(z.string()),
    sba_certifications: z.array(z.string()).optional(),
    state: z.string().nullable(),
    city: z.string().nullable(),
    account_type: AccountTypeSchema,
    client_status: z.string(),
    client_since: z.string().nullable().optional(),
    onboarding_complete: z.boolean().optional(),
    plan_tier: z.string().nullable().optional(),
    created_at: TimestampSchema,
    notes: z.any().nullable(),
    total_tasks: z.number().int().nonnegative(),
    pending_tasks: z.number().int().nonnegative(),
    document_count: z.number().int().nonnegative(),
    match_count: z.number().int().nonnegative(),
    saved_match_count: z.number().int().nonnegative().optional(),
    pursuit_count: z.number().int().nonnegative().optional(),
    active_pursuit_count: z.number().int().nonnegative().optional(),
    competitor_count: z.number().int().nonnegative(),
    activity_count: z.number().int().nonnegative(),
    last_login: TimestampSchema.nullable(),
    activity_score: z.number().int().min(1).max(10).nullable().optional(),
});
export const ClientsListResponseSchema = z.object({
    clients: z.array(ClientRowSchema),
});

// ─── /api/admin/db-stats ──────────────────────────────────────────────────
export const CronStatSchema = z.object({
    route: z.string(),
    last_run: TimestampSchema.nullable(),
    last_status: z.string().nullable(),
    last_error: z.string().nullable(),
    last_rows_out: z.number().nullable(),
    last_elapsed_ms: z.number().nullable().optional(),
    last_success: TimestampSchema.nullable(),
    hours_since_success: z.number().nullable(),
});

export const DbStatsResponseSchema = z.object({
    generated_at: TimestampSchema,
    opportunities: z.object({
        total_estimated: z.number().int().nonnegative(),
        active_estimated: z.number().int().nonnegative(),
        expiring_in_7d_exact: z.number().int().nonnegative(),
        expired_estimated: z.number().int().nonnegative(),
        latest_added: z.object({
            posted_date: z.string().nullable(),
            created_at: z.string().nullable(),
            title: z.string().nullable(),
            agency: z.string().nullable(),
            notice_id: z.string().nullable(),
        }).nullable(),
    }),
    enrichment: z.object({
        denominator: z.number().int().nonnegative(),
        strategic_scoring: z.object({ populated: z.number(), pct: z.number() }),
        ai_win_strategy: z.object({ populated: z.number(), pct: z.number() }),
        structured_requirements: z.object({ populated: z.number(), pct: z.number() }),
    }),
    crons: z.array(CronStatSchema),
    recent_logins: z.array(z.object({
        email: z.string().optional().nullable(),
        last_sign_in_at: z.string().optional().nullable(),
        created_at: z.string(),
    })),
    recent_activity: z.array(z.object({
        id: z.string().uuid(),
        user_profile_id: ProfileIdSchema,
        actor_id: z.string().uuid().nullable(),
        action: z.string(),
        description: z.string(),
        metadata: z.any().nullable(),
        created_at: TimestampSchema,
        profile: z.object({
            company_name: z.string().nullable(),
            account_type: z.string().nullable(),
        }).nullable(),
    })),
    last_cleanup: z.object({
        run_at: TimestampSchema,
        total_rows: z.number().int().nonnegative(),
        by_kind: z.array(z.object({
            kind: z.string(),
            row_count: z.number().int().nonnegative(),
        })),
    }).nullable(),
});

// ─── /api/pipeline/forecast ───────────────────────────────────────────────
export const PipelineForecastResponseSchema = z.object({
    quarters: z.array(z.object({
        label: z.string(),
        fy: z.number().int(),
        q: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        weighted_cents: z.number().int(),
        raw_cents: z.number().int(),
        pursuits: z.number().int(),
    })),
    top_pursuits: z.array(z.object({
        id: z.string().uuid(),
        stage: z.string(),
        pwin: z.number().int().min(0).max(100),
        value_cents: z.number().int(),
        weighted_cents: z.number().int(),
        close_date: z.string().nullable(),
        title: z.string().nullable(),
        agency: z.string().nullable(),
        opportunity_id: z.string().uuid().nullable(),
    })),
    totals: z.object({
        weighted_cents: z.number().int(),
        raw_cents: z.number().int(),
        active_pursuits: z.number().int().nonnegative(),
    }),
    generated_at: TimestampSchema,
});

// ─── /api/admin/cron-runs ─────────────────────────────────────────────────
export const CronRunsResponseSchema = z.object({
    summary: z.array(z.object({
        route: z.string(),
        runs_7d: z.number().int(),
        ok: z.number().int(),
        error: z.number().int(),
        partial: z.number().int(),
        running: z.number().int().optional(),
        avg_ms: z.number().nullable(),
        p50_ms: z.number().nullable().optional(),
        p95_ms: z.number().nullable().optional(),
        last_run: z.string().nullable(),
        last_status: z.string().nullable(),
        last_rows_out: z.number().nullable(),
        total_rows_out_7d: z.number().int(),
        last_error: z.string().nullable(),
    })),
    recent: z.array(z.object({
        id: z.string().uuid(),
        route: z.string(),
        started_at: z.string(),
        finished_at: z.string().nullable(),
        status: z.string().nullable(),
        rows_in: z.number().nullable(),
        rows_out: z.number().nullable(),
        error_message: z.string().nullable(),
        elapsed_ms: z.number().nullable(),
    })),
    window_days: z.number().int(),
    generated_at: TimestampSchema,
});

export const API_CONTRACTS = {
    "/api/admin/clients GET": ClientsListResponseSchema,
    "/api/admin/db-stats GET": DbStatsResponseSchema,
    "/api/admin/cron-runs GET": CronRunsResponseSchema,
    "/api/pipeline/forecast GET": PipelineForecastResponseSchema,
} as const;
