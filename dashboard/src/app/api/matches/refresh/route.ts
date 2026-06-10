/**
 * POST /api/matches/refresh — queue a rescore job for the caller's profile.
 *
 * This used to run scoring synchronously: load every active opportunity into
 * memory, score each, then delete+reinsert user_matches. With 78k+ opps it
 * routinely exceeded the Vercel function timeout, leaving the UI hanging
 * forever with no response.
 *
 * Refactored to enqueue a `rescore_user_matches` worker_jobs row and return
 * 202 immediately with a job id. Clients poll GET /api/matches/refresh/status/[jobId]
 * for completion. The actual scoring lives in `@/lib/rescore-user-matches`
 * and runs from `/api/cron/run_worker_jobs_rescore`.
 *
 * Dedup: worker_jobs.dedup_key collapses multiple in-flight rescores for the
 * same profile to one row (see migration 137). If a rescore is already queued
 * we return the existing job id instead of creating a duplicate.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { protectCrawl } from "@/lib/crawl-protection";

export async function POST(req: NextRequest) {
    // Crawl protection — even queueing should be rate-limited.
    const blocked = await protectCrawl(req, { route: "matches-refresh", maxPerMin: 5 });
    if (blocked) return blocked;

    // Auth check
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service key to enqueue + look up profile
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    // Resolve profile id (worker job keys on user_profiles.id, not auth_user_id)
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const userProfileId = (profile as { id: string }).id;

    // Enqueue the rescore job. dedup_key (task_type + user_profile_id) collapses
    // rapid double-clicks to a single in-flight job. If a row already exists in
    // pending/running, the insert silently does nothing — we then look it up and
    // return its id instead.
    const insertPayload = {
        task_type: "rescore_user_matches",
        payload: { user_profile_id: userProfileId, reason: "manual" },
        priority: 9, // user-initiated → above background enrichment
    };

    const { data: inserted } = await sb
        .from("worker_jobs")
        .insert(insertPayload)
        .select("id")
        .maybeSingle();

    let jobId = (inserted as { id: string } | null)?.id ?? null;
    let coalesced = false;

    if (!jobId) {
        // Insert was a no-op due to dedup uniqueness — find the existing
        // pending/running row for this profile.
        const { data: existing } = await sb
            .from("worker_jobs")
            .select("id")
            .eq("task_type", "rescore_user_matches")
            .in("status", ["pending", "running"])
            .filter("payload->>user_profile_id", "eq", userProfileId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        jobId = (existing as { id: string } | null)?.id ?? null;
        coalesced = !!jobId;
    }

    if (!jobId) {
        return NextResponse.json(
            { error: "failed to enqueue rescore job" },
            { status: 500 }
        );
    }

    return NextResponse.json(
        {
            success: true,
            queued: true,
            coalesced,
            job_id: jobId,
        },
        { status: 202 }
    );
}
