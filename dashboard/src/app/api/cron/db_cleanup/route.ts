import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// Fix: orphan-handler audit (2026-06) — route had no Vercel cron entry AND no
// orchestrator dispatch, so weekly lifecycle cleanup never ran in production.
// Now invoked by enrichment_orchestrator at Sun 04:00 UTC (one slot in vercel.json
// would have pushed us to 41/40 on Pro plan). Telemetry wrapper added so
// /admin/health and cron_runs reflect actual execution.
import { withCronTelemetry } from "@/lib/cron-telemetry";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Strategic lifecycle cleanup. Runs weekly (Sunday 04:00 UTC).
 *
 * Transitions:
 *   ACTIVE (deadline ≤ 7d)     → EXPIRING_SOON
 *   ACTIVE/EXPIRING_SOON past  → EXPIRED
 *   MARKET_RESEARCH past       → INTELLIGENCE (retention_protected=true)
 *   EXPIRED > 120d             → ARCHIVED
 *   ARCHIVED > 365d            → hard delete (via safeguarded view)
 *   INTELLIGENCE > 730d, no solicitation → hard delete (via safeguarded view)
 *
 * Safeguards (enforced by SQL views 058):
 *   Never deletes rows with user_pursuits, HOT/WARM/saved user_matches, or
 *   opportunity_attachments carrying extracted_text > 500 chars.
 *
 * Side effects: deletes cached PDFs from the `opportunity-attachments` bucket
 * when an opp is hard-deleted, logs every batch to `cleanup_log`.
 */

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

async function logStep(
    supabase: ReturnType<typeof getSupabase>,
    kind: string,
    ids: string[],
    notes: Record<string, unknown> = {},
) {
    if (ids.length === 0) return;
    await supabase.from("cleanup_log").insert({
        kind,
        row_count: ids.length,
        opportunity_ids: ids,
        notes,
    });
}

/** UPDATE in chunks of 100 UUIDs to stay under PostgREST/CDN URL limits (~16KB).
 *  Silently skips chunks that error so one bad row doesn't block the rest. */
async function updateInChunks(
    supabase: ReturnType<typeof getSupabase>,
    table: string,
    ids: string[],
    patch: Record<string, unknown>,
    chunkSize = 100,
): Promise<number> {
    let ok = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { error } = await supabase.from(table).update(patch).in("id", slice);
        if (!error) ok += slice.length;
    }
    return ok;
}

/** DELETE in chunks of 100 UUIDs (same URL-length reason). */
async function deleteInChunks(
    supabase: ReturnType<typeof getSupabase>,
    table: string,
    ids: string[],
    chunkSize = 100,
): Promise<number> {
    let ok = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { error } = await supabase.from(table).delete().in("id", slice);
        if (!error) ok += slice.length;
    }
    return ok;
}

/** Remove cached PDFs for opps about to be deleted. Best-effort.
 *  Files are stored as `{notice_id}/{timestamp}.pdf` by deep_enrich — we list
 *  each notice_id prefix and remove everything under it. Only opps that
 *  actually have attachment records get probed, so the cost stays bounded. */
async function purgeAttachmentStorage(
    supabase: ReturnType<typeof getSupabase>,
    oppIds: string[],
): Promise<number> {
    if (oppIds.length === 0) return 0;
    const { data: withAttachments } = await supabase
        .from("opportunity_attachments")
        .select("opportunity_id")
        .in("opportunity_id", oppIds);
    const oppIdsWithFiles = [...new Set((withAttachments || []).map(
        (r: { opportunity_id: string }) => r.opportunity_id,
    ))];
    if (oppIdsWithFiles.length === 0) return 0;
    const { data: rows } = await supabase
        .from("opportunities")
        .select("notice_id")
        .in("id", oppIdsWithFiles)
        .not("notice_id", "is", null);
    const noticeIds = (rows || [])
        .map((r: { notice_id: string | null }) => r.notice_id)
        .filter((n): n is string => !!n);
    let removed = 0;
    for (const noticeId of noticeIds) {
        try {
            const { data: files } = await supabase.storage
                .from("opportunity-attachments")
                .list(noticeId, { limit: 100 });
            if (!files || files.length === 0) continue;
            const paths = files.map((f) => `${noticeId}/${f.name}`);
            const { data: rm } = await supabase.storage
                .from("opportunity-attachments")
                .remove(paths);
            removed += rm?.length || 0;
        } catch {
            // ignore — missing folder is fine
        }
    }
    return removed;
}

async function GET_handler(req: NextRequest) {
    // Fail-closed cron auth (CRON_SECRET or SUPABASE_SERVICE_KEY bearer).
    const denied = guardCron(req);
    if (denied) return denied;

    const supabase = getSupabase();
    const startTime = Date.now();

    try {
        const now = new Date();
        const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString();
        const nowIso = now.toISOString();
        const days120Ago = new Date(now.getTime() - 120 * 86400000).toISOString();

        const stats: Record<string, number> = {};

        // 1. ACTIVE → EXPIRING_SOON
        const { data: expSoon } = await supabase
            .from("opportunities").select("id")
            .eq("status", "ACTIVE")
            .lt("response_deadline", sevenDaysOut)
            .gt("response_deadline", nowIso)
            .limit(2000);
        if (expSoon?.length) {
            const ids = expSoon.map(r => r.id);
            stats.expiring_soon = await updateInChunks(supabase, "opportunities", ids, { status: "EXPIRING_SOON" });
            await logStep(supabase, "transition_expiring_soon", ids);
        }

        // 2. ACTIVE / EXPIRING_SOON → EXPIRED
        stats.expired = 0;
        for (const s of ["ACTIVE", "EXPIRING_SOON"]) {
            const { data } = await supabase
                .from("opportunities").select("id")
                .eq("status", s)
                .lt("response_deadline", nowIso)
                .limit(2000);
            if (data?.length) {
                const ids = data.map(r => r.id);
                stats.expired += await updateInChunks(supabase, "opportunities", ids, { status: "EXPIRED" });
                await logStep(supabase, "transition_expired", ids, { from: s });
            }
        }

        // 3. MARKET_RESEARCH → INTELLIGENCE (sources-sought past deadline)
        const { data: mrData } = await supabase
            .from("opportunities").select("id")
            .eq("status", "MARKET_RESEARCH")
            .lt("response_deadline", nowIso)
            .limit(2000);
        if (mrData?.length) {
            const ids = mrData.map(r => r.id);
            stats.intelligence = await updateInChunks(supabase, "opportunities", ids, {
                status: "INTELLIGENCE",
                retention_protected: true,
                retention_reason: "intelligence",
            });
            await logStep(supabase, "transition_intelligence", ids);
        }

        // 4. EXPIRED → ARCHIVED (>120d, not protected)
        const { data: archData } = await supabase
            .from("opportunities").select("id")
            .eq("status", "EXPIRED")
            .lt("response_deadline", days120Ago)
            .eq("retention_protected", false)
            .limit(2000);
        if (archData?.length) {
            const ids = archData.map(r => r.id);
            stats.archived = await updateInChunks(supabase, "opportunities", ids, { status: "ARCHIVED" });
            await logStep(supabase, "transition_archived", ids);
        }

        // 5. Hard-delete ARCHIVED rows (safeguarded view — no pursuits, no
        //    HOT/WARM matches, no extracted attachments).
        stats.deleted = 0;
        stats.storage_purged = 0;
        const { data: delData } = await supabase
            .from("opportunities_deletable_archived")
            .select("id")
            .limit(1000);
        if (delData?.length) {
            const ids = delData.map((r: { id: string }) => r.id);
            stats.storage_purged += await purgeAttachmentStorage(supabase, ids);
            stats.deleted = await deleteInChunks(supabase, "opportunities", ids);
            await logStep(supabase, "hard_delete_archived", ids, { storage_purged: stats.storage_purged });
        }

        // 6. Hard-delete stale INTELLIGENCE rows (safeguarded view)
        stats.intel_deleted = 0;
        const { data: intelDel } = await supabase
            .from("opportunities_deletable_intelligence")
            .select("id")
            .limit(1000);
        if (intelDel?.length) {
            const ids = intelDel.map((r: { id: string }) => r.id);
            const purged = await purgeAttachmentStorage(supabase, ids);
            stats.storage_purged += purged;
            stats.intel_deleted = await deleteInChunks(supabase, "opportunities", ids);
            await logStep(supabase, "hard_delete_intelligence", ids, { storage_purged: purged });
        }

        // 7. Flag LOW_QUALITY contractors
        stats.flagged = 0;
        const { data: lowQ } = await supabase
            .from("contractors").select("id")
            .is("website", null).is("phone", null).is("city", null).is("state", null)
            .neq("data_quality_flag", "LOW_QUALITY")
            .limit(1000);
        if (lowQ?.length) {
            const ids = lowQ.map(c => c.id);
            stats.flagged = await updateInChunks(supabase, "contractors", ids, { data_quality_flag: "LOW_QUALITY" });
        }

        // 8. Legacy: anything missing status but past deadline → EXPIRED
        const { data: legacyExpired } = await supabase
            .from("opportunities").select("id")
            .lt("response_deadline", nowIso)
            .eq("is_archived", false)
            .is("status", null)
            .limit(2000);
        if (legacyExpired?.length) {
            const ids = legacyExpired.map(r => r.id);
            stats.legacy_archived = await updateInChunks(supabase, "opportunities", ids, { is_archived: true, status: "EXPIRED" });
        }

        // 9. Stale match cleanup
        const { data: staleMatches } = await supabase
            .from("user_matches")
            .select("id, opportunity:opportunities!inner(status)")
            .in("opportunity.status", ["ARCHIVED", "DELETED"])
            .limit(2000);
        if (staleMatches?.length) {
            const ids = staleMatches.map(m => m.id);
            stats.stale_matches = await deleteInChunks(supabase, "user_matches", ids);
        }

        // Audit-log retention — prune client_activity_log entries older
        // than 90 days. Uses the purge_old_activity_log() function from
        // migration 071 so the retention window is in one place.
        try {
            const { data: purged, error: purgeErr } = await supabase.rpc("purge_old_activity_log");
            if (!purgeErr && typeof purged === "number" && purged > 0) {
                stats.activity_log_purged = purged;
                await logStep(supabase, "activity_log_purge", [], { row_count: purged });
            }
        } catch (e) {
            console.warn("audit-log purge failed (non-fatal):", e);
        }

        // GDPR — process any deletion requests whose 7-day grace window
        // has expired. We hard-delete the auth user + cascade to profile
        // and write a final cleanup_log entry so it's auditable.
        try {
            const { data: due } = await supabase
                .from("account_deletion_requests")
                .select("id, auth_user_id, user_profile_id")
                .is("completed_at", null)
                .is("cancelled_at", null)
                .lte("grace_window_ends_at", new Date().toISOString())
                .limit(20);
            const overdue = (due as Array<{ id: string; auth_user_id: string; user_profile_id: string | null }> | null) || [];
            let processed = 0;
            for (const r of overdue) {
                try {
                    await supabase.auth.admin.deleteUser(r.auth_user_id);
                    await supabase.from("account_deletion_requests")
                        .update({ completed_at: new Date().toISOString() })
                        .eq("id", r.id);
                    processed++;
                } catch (e) {
                    console.warn("deletion request failed:", r.id, e);
                }
            }
            if (processed > 0) {
                stats.gdpr_deletions = processed;
                await logStep(supabase, "gdpr_deletion", overdue.slice(0, processed).map(r => r.user_profile_id || r.id), { processed });
            }
        } catch (e) {
            console.warn("gdpr cleanup failed (non-fatal):", e);
        }

        const elapsed_ms = Date.now() - startTime;
        await supabase.from("cleanup_log").insert({
            kind: "run_summary",
            row_count: 0,
            notes: { ...stats, elapsed_ms },
        });

        return NextResponse.json({ success: true, ...stats, elapsed_ms });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Cleanup Error:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export const GET = withCronTelemetry("/api/cron/db_cleanup", GET_handler);
