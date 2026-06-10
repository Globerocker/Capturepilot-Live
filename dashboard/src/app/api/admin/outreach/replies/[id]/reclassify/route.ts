import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * POST /api/admin/outreach/replies/[id]/reclassify
 *
 * Re-enqueues the LLM sentiment classifier on this reply by inserting a
 * worker_jobs row. The classifier worker is responsible for updating
 * sentiment / intent / confidence on the reply when it picks the job up.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await assertAdminWithUser();
    if (!("userId" in auth)) return auth;

    const { id } = await ctx.params;
    const db = admin();

    const { data: reply, error: readErr } = await db
        .from("outreach_replies")
        .select("id")
        .eq("id", id)
        .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!reply) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Reset sentiment to unsure so the UI shows the job is in flight.
    await db
        .from("outreach_replies")
        .update({
            sentiment: "unsure",
            sentiment_source: "auto",
            intent: null,
            confidence: null,
        })
        .eq("id", id);

    const { error: insertErr } = await db.from("worker_jobs").insert({
        task_type: "classify_reply_sentiment",
        payload: { reply_id: id, requested_by: auth.userId },
        priority: 50,
        status: "pending",
    });

    if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, queued: true });
}
