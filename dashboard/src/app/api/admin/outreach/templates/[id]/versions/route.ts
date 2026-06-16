/**
 * GET  /api/admin/outreach/templates/[id]/versions
 *      Change history for a template (newest first). Each row is the snapshot
 *      of the template BEFORE an edit, captured by the migration-170 trigger.
 *
 * POST /api/admin/outreach/templates/[id]/versions  { version: number }
 *      Restore the template to a prior version. Restoring is itself an edit, so
 *      the trigger snapshots the current state first — you can always undo it.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;

    const { data, error } = await db()
        .from("outreach_template_versions")
        .select("id, version, name, channel, subject, subject_b, body, body_b, category, description, approved, snapshot_at")
        .eq("template_id", id)
        .order("version", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ versions: data || [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => null)) as { version?: number } | null;
    const version = Number(body?.version);
    if (!Number.isFinite(version)) {
        return NextResponse.json({ error: "version (number) required" }, { status: 400 });
    }

    const sb = db();
    const { data: snap, error: snapErr } = await sb
        .from("outreach_template_versions")
        .select("name, subject, subject_b, body, body_b, category, description")
        .eq("template_id", id)
        .eq("version", version)
        .maybeSingle();
    if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });
    if (!snap) return NextResponse.json({ error: "version not found" }, { status: 404 });

    // Writing the old values back is an UPDATE → the trigger snapshots the
    // current (pre-restore) state, so a restore is itself reversible.
    const { data, error } = await sb
        .from("outreach_templates")
        .update({
            name: snap.name,
            subject: snap.subject,
            subject_b: snap.subject_b,
            body: snap.body,
            body_b: snap.body_b,
            category: snap.category,
            description: snap.description,
        })
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data, restored_from: version });
}
