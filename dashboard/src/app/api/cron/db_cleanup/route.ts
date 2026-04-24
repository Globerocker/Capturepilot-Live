import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(req: NextRequest) {
    // Dual auth: Vercel cron OR Supabase pg_cron service key
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = serviceKey ? `Bearer ${serviceKey}` : null;
    if ((expectedCron || expectedSvc) && authHeader !== expectedCron && authHeader !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
            await supabase.from("opportunities").update({ status: "EXPIRING_SOON" }).in("id", ids);
            stats.expiring_soon = ids.length;
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
                await supabase.from("opportunities").update({ status: "EXPIRED" }).in("id", ids);
                stats.expired += ids.length;
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
            await supabase.from("opportunities").update({
                status: "INTELLIGENCE",
                retention_protected: true,
                retention_reason: "intelligence",
            }).in("id", ids);
            stats.intelligence = ids.length;
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
            await supabase.from("opportunities").update({ status: "ARCHIVED" }).in("id", ids);
            stats.archived = ids.length;
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
            await supabase.from("opportunities").delete().in("id", ids);
            stats.deleted = ids.length;
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
            await supabase.from("opportunities").delete().in("id", ids);
            stats.intel_deleted = ids.length;
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
            await supabase.from("contractors").update({ data_quality_flag: "LOW_QUALITY" }).in("id", ids);
            stats.flagged = ids.length;
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
            await supabase.from("opportunities").update({ is_archived: true, status: "EXPIRED" }).in("id", ids);
            stats.legacy_archived = ids.length;
        }

        // 9. Stale match cleanup
        const { data: staleMatches } = await supabase
            .from("user_matches")
            .select("id, opportunity:opportunities!inner(status)")
            .in("opportunity.status", ["ARCHIVED", "DELETED"])
            .limit(2000);
        if (staleMatches?.length) {
            const ids = staleMatches.map(m => m.id);
            await supabase.from("user_matches").delete().in("id", ids);
            stats.stale_matches = ids.length;
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
