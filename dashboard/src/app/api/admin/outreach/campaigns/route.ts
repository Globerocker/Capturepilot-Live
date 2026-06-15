import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

/**
 * GET  /api/admin/outreach/campaigns?status=draft|active|paused|completed|archived|all
 *      Returns the list with denormalized stats for the table view.
 *
 * POST /api/admin/outreach/campaigns
 *      Body: { name, description?, channels[], sender_email?, sender_name?,
 *              target_segment, throttle_per_hour?, send_window_*?,
 *              physical_address?, unsubscribe_footer?, steps[],
 *              activate?: boolean }
 *      Creates a campaign + steps. If `activate=true`, flips status to active
 *      and enrolls contacts from the target_segment.
 */

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface CampaignStepInput {
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
}

interface CampaignPostBody {
    name: string;
    description?: string;
    channels: string[];
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
    steps?: CampaignStepInput[];
    activate?: boolean;
}

export async function GET(req: NextRequest) {
    const auth = await assertAdminWithUser();
    if (!auth.ok) return auth.response;

    const admin = getAdmin();
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "all";

    let q = admin
        .from("outreach_campaigns")
        .select("id, name, description, channels, status, contacts_count, sent_count, open_count, click_count, reply_count, bounce_count, started_at, completed_at, created_at, sender_email, sender_name")
        .order("created_at", { ascending: false })
        .limit(200);

    if (status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const campaigns = (data ?? []).map(c => {
        const sent = Number(c.sent_count || 0);
        const reply = Number(c.reply_count || 0);
        const reply_rate = sent > 0 ? Math.round((reply / sent) * 1000) / 10 : 0;
        return { ...c, reply_rate };
    });

    return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
    const ctx = await assertAdminWithUser();
    if (!ctx.ok) return ctx.response;

    let body: CampaignPostBody;
    try { body = await req.json() as CampaignPostBody; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    if (!body.name || typeof body.name !== "string") {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!Array.isArray(body.channels) || body.channels.length === 0) {
        return NextResponse.json({ error: "At least one channel is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const activate = body.activate === true;

    const campaignRow = {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        channels: body.channels.filter(c => c === "email" || c === "sms"),
        sender_email: body.sender_email?.trim() || null,
        sender_name: body.sender_name?.trim() || null,
        target_segment: body.target_segment ?? {},
        // Live schema stores send pacing as a single throttle jsonb (the cadence
        // reads campaign.throttle for its send-window check).
        throttle: {
            per_hour: body.throttle_per_hour ?? 60,
            window_start: body.send_window_start ?? "09:00",
            window_end: body.send_window_end ?? "17:00",
            tz: body.send_window_tz ?? "America/New_York",
        },
        physical_address: body.physical_address?.trim() || null,
        unsubscribe_footer: body.unsubscribe_footer ?? null,
        stop_on_reply: body.stop_on_reply !== false, // default on
        status: activate ? "active" : "draft",
        started_at: activate ? new Date().toISOString() : null,
        created_by: ctx.userId,
    };

    const { data: campaign, error: insertErr } = await admin
        .from("outreach_campaigns")
        .insert(campaignRow)
        .select("id")
        .single();

    if (insertErr || !campaign) {
        return NextResponse.json({ error: insertErr?.message || "Insert failed" }, { status: 500 });
    }

    const campaignId = campaign.id as string;

    // Insert steps (validate + normalize)
    const steps = Array.isArray(body.steps) ? body.steps : [];
    if (steps.length > 0) {
        const stepRows = steps.map((s, idx) => ({
            campaign_id: campaignId,
            step_order: s.step_index ?? idx,
            channel: s.channel,
            delay_value: Math.max(0, Number(s.delay_value || 0)),
            delay_unit: s.delay_unit ?? "hours",
            subject: s.channel === "email" ? (s.subject || "").slice(0, 998) : null,
            body_template: (s.body || "").slice(0, 50_000),
            skip_if_replied: s.skip_if_replied !== false,
            skip_if_clicked: !!s.skip_if_clicked,
            send_condition: s.send_condition === "if_no_reply" ? "if_no_reply" : "always",
            variant_weight: s.variant_weight ?? 100,
        }));

        const { error: stepErr } = await admin.from("outreach_campaign_steps").insert(stepRows);
        if (stepErr) {
            // Roll back the campaign row to keep state clean
            await admin.from("outreach_campaigns").delete().eq("id", campaignId);
            return NextResponse.json({ error: `Step insert failed: ${stepErr.message}` }, { status: 500 });
        }
    }

    // If activating, enroll contacts from the segment. We seed from
    // outreach_prospects matching the segment filter. The send worker picks up
    // from there.
    let enrolled = 0;
    if (activate) {
        enrolled = await enrollFromSegment(admin, campaignId, body.target_segment ?? {});
    }

    return NextResponse.json({ id: campaignId, enrolled });
}

interface SegmentInput {
    naics?: string[];
    states?: string[];
    certs?: string[];
    tags?: string[];
    list_id?: string | null;
    custom_filter?: string;
}

async function enrollFromSegment(
    admin: ReturnType<typeof getAdmin>,
    campaignId: string,
    segment: Record<string, unknown>,
): Promise<number> {
    const s = segment as SegmentInput;
    let q = admin
        .from("outreach_prospects")
        .select("id, primary_email, primary_phone, primary_name, company_name")
        .eq("status", "approved")
        .not("primary_email", "is", null)
        .limit(5000);

    if (Array.isArray(s.naics) && s.naics.length > 0) {
        q = q.overlaps("naics_codes", s.naics);
    }
    if (Array.isArray(s.states) && s.states.length > 0) {
        q = q.in("state", s.states);
    }
    if (Array.isArray(s.certs) && s.certs.length > 0) {
        q = q.overlaps("certifications", s.certs);
    }

    const { data, error } = await q;
    if (error || !data) return 0;

    type Prospect = {
        id: string;
        primary_email: string | null;
        primary_phone: string | null;
        primary_name: string | null;
        company_name: string;
    };
    const rows = (data as Prospect[]).map(p => {
        const fullName = (p.primary_name || "").trim();
        const [firstName, ...rest] = fullName.split(/\s+/);
        return {
            campaign_id: campaignId,
            prospect_id: p.id,
            email: p.primary_email,
            phone: p.primary_phone,
            first_name: firstName || null,
            last_name: rest.length > 0 ? rest.join(" ") : null,
            company_name: p.company_name,
            status: "enrolled" as const,
            current_step: 0,
            next_send_at: new Date().toISOString(),
        };
    });

    if (rows.length === 0) return 0;

    // upsert ignores duplicates by (campaign_id, lower(email))
    const { error: insertErr, count } = await admin
        .from("outreach_campaign_contacts")
        .upsert(rows, { onConflict: "campaign_id,email", count: "exact", ignoreDuplicates: true });

    if (insertErr) return 0;
    const enrolled = count ?? rows.length;

    // Bump campaign denorm count
    await admin
        .from("outreach_campaigns")
        .update({ contacts_count: enrolled })
        .eq("id", campaignId);

    return enrolled;
}
