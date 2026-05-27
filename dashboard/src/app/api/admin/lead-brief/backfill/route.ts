import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { enqueueLeadBrief } from "@/lib/lead-brief";

/**
 * POST /api/admin/lead-brief/backfill?limit=5
 *
 * Enqueues an enrich_lead_brief job for the N oldest leads that don't yet
 * have a brief. Worker picks them up on its next tick (every 5 min via the
 * orchestrator). Email lands in americurial@gmail.com shortly after.
 *
 * Re-running on the same set is safe — worker_jobs dedup-key prevents
 * duplicate pending jobs for the same lead.
 *
 * Query params:
 *   limit  — number of leads to enqueue (default 5, max 50)
 *   force  — "1" to re-enqueue even leads that already have a brief
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5), 1), 50);
    const force = url.searchParams.get("force") === "1";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let query = sb
        .from("marketing_leads")
        .select("id, email, magnet_key, created_at, lead_brief_status")
        .order("created_at", { ascending: true })
        .limit(limit);
    if (!force) {
        // Only leads that haven't been briefed yet OR previously failed.
        query = query.or("lead_brief_status.is.null,lead_brief_status.eq.failed");
    }

    const { data: leads, error } = await query as {
        data: { id: string; email: string; magnet_key: string; created_at: string; lead_brief_status: string | null }[] | null;
        error: { message: string } | null;
    };
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) {
        return NextResponse.json({ enqueued: 0, leads: [], note: "no eligible leads" });
    }

    const enqueued: { id: string; email: string; magnet: string }[] = [];
    for (const lead of leads) {
        try {
            await enqueueLeadBrief(sb, lead.id);
            enqueued.push({ id: lead.id, email: lead.email, magnet: lead.magnet_key });
        } catch (e) {
            console.warn(`[backfill] failed to enqueue ${lead.id}:`, (e as Error).message);
        }
    }

    return NextResponse.json({
        enqueued: enqueued.length,
        leads: enqueued,
        note: "Worker will run these on its next tick (within 5 min). Brief email lands in americurial@gmail.com when each one finishes.",
    });
}
