import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = getSupabase();
        console.log("Starting Strategic Lifecycle Cleanup...");

        const now = new Date();
        const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString();
        const nowIso = now.toISOString();
        const days120Ago = new Date(now.getTime() - 120 * 86400000).toISOString();
        const months12Ago = new Date(now.getTime() - 365 * 86400000).toISOString();
        const months24Ago = new Date(now.getTime() - 730 * 86400000).toISOString();

        const stats: Record<string, number> = {};

        // 1. ACTIVE → EXPIRING_SOON (deadline within 7 days)
        stats.expiring_soon = 0;
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
        }

        // 2. ACTIVE/EXPIRING_SOON → EXPIRED (deadline passed)
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
            }
        }

        // 3. MARKET_RESEARCH → INTELLIGENCE (Sources Sought past deadline)
        stats.intelligence = 0;
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
        }

        // 4. EXPIRED → ARCHIVED (deadline > 120 days, not protected)
        stats.archived = 0;
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
        }

        // 5. DELETE: ARCHIVED > 12 months, not protected
        stats.deleted = 0;
        const { data: delData } = await supabase
            .from("opportunities").select("id")
            .eq("status", "ARCHIVED")
            .lt("status_changed_at", months12Ago)
            .eq("retention_protected", false)
            .limit(1000);
        if (delData?.length) {
            const ids = delData.map(r => r.id);
            await supabase.from("opportunities").delete().in("id", ids);
            stats.deleted = ids.length;
        }

        // 6. DELETE: INTELLIGENCE > 24 months, no linked solicitation
        stats.intel_deleted = 0;
        const { data: intelDel } = await supabase
            .from("opportunities").select("id")
            .eq("status", "INTELLIGENCE")
            .lt("posted_date", months24Ago)
            .is("related_notice_id", null)
            .eq("retention_protected", false)
            .limit(1000);
        if (intelDel?.length) {
            const ids = intelDel.map(r => r.id);
            await supabase.from("opportunities").delete().in("id", ids);
            stats.intel_deleted = ids.length;
        }

        // 7. Flag LOW_QUALITY contractors
        stats.flagged = 0;
        const { data: lowQ } = await supabase
            .from("contractors").select("id")
            .is("website", null)
            .is("phone", null)
            .is("city", null)
            .is("state", null)
            .neq("data_quality_flag", "LOW_QUALITY")
            .limit(1000);
        if (lowQ?.length) {
            const ids = lowQ.map(c => c.id);
            await supabase.from("contractors").update({ data_quality_flag: "LOW_QUALITY" }).in("id", ids);
            stats.flagged = ids.length;
        }

        // Legacy compat: archive any is_archived=false with past deadlines + no status
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

        console.log("Lifecycle Cleanup Complete:", stats);
        return NextResponse.json({ success: true, ...stats });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Cleanup Error:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
