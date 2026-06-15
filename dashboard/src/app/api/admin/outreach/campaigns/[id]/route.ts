import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

/**
 * GET    /api/admin/outreach/campaigns/[id]
 *        Full campaign payload + steps.
 *
 * PATCH  /api/admin/outreach/campaigns/[id]
 *        Body: { name?, description?, status?, steps?, … }
 *        Supports rename, status transitions (draft→active, active→paused,
 *        paused→active, *→archived), and full step replacement.
 *
 * DELETE /api/admin/outreach/campaigns/[id]
 *        Soft delete — flips status to archived. We never hard-delete because
 *        the events log carries reply/bounce metrics.
 */

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    draft: ["active", "archived"],
    active: ["paused", "completed", "archived"],
    paused: ["active", "archived"],
    completed: ["archived"],
    archived: [],
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await assertAdminWithUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = getAdmin();

    const { data: campaign, error } = await admin
        .from("outreach_campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: steps } = await admin
        .from("outreach_campaign_steps")
        .select("*")
        .eq("campaign_id", id)
        .order("step_index", { ascending: true })
        .order("variant_key", { ascending: true });

    return NextResponse.json({ campaign, steps: steps ?? [] });
}

interface PatchBody {
    name?: string;
    description?: string;
    channels?: string[];
    sender_email?: string;
    sender_name?: string;
    target_segment?: Record<string, unknown>;
    throttle_per_hour?: number;
    send_window_start?: string;
    send_window_end?: string;
    send_window_tz?: string;
    physical_address?: string;
    unsubscribe_footer?: string;
    stop_on_reply?: boolean;
    status?: string;
    steps?: Array<{
        step_index: number;
        channel: "email" | "sms" | "wait";
        delay_value: number;
        delay_unit: "minutes" | "hours" | "days";
        after_step?: number | null;
        subject?: string;
        body: string;
        body_format?: "text" | "html" | "markdown";
        skip_if_replied?: boolean;
        skip_if_clicked?: boolean;
        send_condition?: "always" | "if_no_reply";
        variant_key?: string;
        variant_weight?: number;
    }>;
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await assertAdminWithUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    let body: PatchBody;
    try { body = await req.json() as PatchBody; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const admin = getAdmin();

    // Fetch current row for status-transition validation
    const { data: current, error: fetchErr } = await admin
        .from("outreach_campaigns")
        .select("status")
        .eq("id", id)
        .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === "string") update.name = body.name.trim();
    if (typeof body.description === "string") update.description = body.description.trim();
    if (Array.isArray(body.channels)) update.channels = body.channels.filter(c => c === "email" || c === "sms");
    if (typeof body.sender_email === "string") update.sender_email = body.sender_email.trim() || null;
    if (typeof body.sender_name === "string") update.sender_name = body.sender_name.trim() || null;
    if (body.target_segment) update.target_segment = body.target_segment;
    if (typeof body.throttle_per_hour === "number") update.throttle_per_hour = body.throttle_per_hour;
    if (typeof body.send_window_start === "string") update.send_window_start = body.send_window_start;
    if (typeof body.send_window_end === "string") update.send_window_end = body.send_window_end;
    if (typeof body.send_window_tz === "string") update.send_window_tz = body.send_window_tz;
    if (typeof body.physical_address === "string") update.physical_address = body.physical_address.trim() || null;
    if (typeof body.unsubscribe_footer === "string") update.unsubscribe_footer = body.unsubscribe_footer;
    if (typeof body.stop_on_reply === "boolean") update.stop_on_reply = body.stop_on_reply;

    if (typeof body.status === "string") {
        const currentStatus = current.status as string;
        if (currentStatus !== body.status) {
            const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
            if (!allowed.includes(body.status)) {
                return NextResponse.json(
                    { error: `Cannot transition from ${currentStatus} to ${body.status}` },
                    { status: 400 },
                );
            }
            update.status = body.status;
            if (body.status === "active" && currentStatus === "draft") {
                update.started_at = new Date().toISOString();
            }
            if (body.status === "completed") update.completed_at = new Date().toISOString();
            if (body.status === "archived") update.archived_at = new Date().toISOString();
        }
    }

    const { error: updateErr } = await admin
        .from("outreach_campaigns")
        .update(update)
        .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Optional full step replacement
    if (Array.isArray(body.steps)) {
        await admin.from("outreach_campaign_steps").delete().eq("campaign_id", id);
        if (body.steps.length > 0) {
            const stepRows = body.steps.map((s, idx) => ({
                campaign_id: id,
                step_index: s.step_index ?? idx,
                channel: s.channel,
                delay_value: Math.max(0, Number(s.delay_value || 0)),
                delay_unit: s.delay_unit ?? "hours",
                after_step: s.after_step ?? null,
                subject: s.channel === "email" ? (s.subject || "").slice(0, 998) : null,
                body: (s.body || "").slice(0, 50_000),
                body_format: s.body_format ?? "text",
                skip_if_replied: s.skip_if_replied !== false,
                skip_if_clicked: !!s.skip_if_clicked,
                send_condition: s.send_condition === "if_no_reply" ? "if_no_reply" : "always",
                variant_key: s.variant_key ?? "A",
                variant_weight: s.variant_weight ?? 100,
            }));
            const { error: stepErr } = await admin.from("outreach_campaign_steps").insert(stepRows);
            if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await assertAdminWithUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = getAdmin();

    const { error } = await admin
        .from("outreach_campaigns")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
