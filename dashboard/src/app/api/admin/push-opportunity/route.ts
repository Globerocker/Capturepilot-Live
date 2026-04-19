import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { sendAgencyPipelineNotification } from "@/lib/email";
import { fireWebhookEvent } from "@/lib/webhooks";

export const maxDuration = 30;

/**
 * POST /api/admin/push-opportunity
 *
 * Admin-only. Hand-picks an opportunity and drops it into a specific agency
 * client's pipeline, logs the push, and emails the client a "we spotted this
 * and are actively working on it" note.
 *
 * Body: {
 *   user_profile_id: string,
 *   opportunity_id?: string,   // OR
 *   notice_id?: string,
 *   stage?: string,            // default 'researching'
 *   priority?: 'high' | 'medium' | 'low',
 *   customer_message?: string, // shown in the email quote
 *   internal_notes?: string,
 *   next_steps?: string[],     // bullet list in the email
 * }
 */

async function assertAdmin(): Promise<{ ok: true; userId: string; email: string | null; name: string } | { ok: false; error: string; status: number }> {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: "Unauthorized", status: 401 };

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, account_type, contact_name, company_name, email")
        .eq("auth_user_id", user.id)
        .single();

    const p = profile as Record<string, unknown> | null;
    if (!p || p.account_type !== "admin") {
        return { ok: false, error: "Forbidden — admin only", status: 403 };
    }

    return {
        ok: true,
        userId: user.id,
        email: (p.email as string | null) || user.email || null,
        name: (p.contact_name as string) || (p.company_name as string) || "Americurial Team",
    };
}

export async function POST(req: NextRequest) {
    const auth = await assertAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const userProfileId = (body.user_profile_id as string | undefined)?.trim();
    const opportunityIdInput = (body.opportunity_id as string | undefined)?.trim();
    const noticeId = (body.notice_id as string | undefined)?.trim();
    const stage = (body.stage as string) || "researching";
    const priority = (body.priority as string) || "high";
    const customerMessage = (body.customer_message as string) || null;
    const internalNotes = (body.internal_notes as string) || null;
    const nextSteps = Array.isArray(body.next_steps) ? (body.next_steps as string[]).slice(0, 10) : [];

    if (!userProfileId) {
        return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });
    }
    if (!opportunityIdInput && !noticeId) {
        return NextResponse.json({ error: "opportunity_id or notice_id required" }, { status: 400 });
    }

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load target client profile
    const { data: clientProfile } = await db
        .from("user_profiles")
        .select("id, contact_name, company_name, email, account_type")
        .eq("id", userProfileId)
        .single();
    const client = clientProfile as Record<string, unknown> | null;
    if (!client) return NextResponse.json({ error: "client profile not found" }, { status: 404 });

    // Resolve opportunity
    let opportunityId = opportunityIdInput || null;
    let oppRecord: Record<string, unknown> | null = null;
    if (noticeId) {
        const { data } = await db
            .from("opportunities")
            .select("id, notice_id, title, department, agency, response_deadline")
            .eq("notice_id", noticeId)
            .single();
        if (!data) return NextResponse.json({ error: `no opportunity for notice_id=${noticeId}` }, { status: 404 });
        oppRecord = data;
        opportunityId = data.id as string;
    } else if (opportunityId) {
        const { data } = await db
            .from("opportunities")
            .select("id, notice_id, title, department, agency, response_deadline")
            .eq("id", opportunityId)
            .single();
        if (!data) return NextResponse.json({ error: `no opportunity for id=${opportunityId}` }, { status: 404 });
        oppRecord = data;
    }

    // Dedupe: if a pursuit already exists, skip creating but still email the update
    const { data: existing } = await db
        .from("user_pursuits")
        .select("id, stage")
        .eq("user_profile_id", userProfileId)
        .eq("opportunity_id", opportunityId!)
        .maybeSingle();

    let pursuitId = existing?.id as string | undefined;

    if (!pursuitId) {
        const { data: created, error } = await db
            .from("user_pursuits")
            .insert({
                user_profile_id: userProfileId,
                opportunity_id: opportunityId!,
                stage,
                priority,
                notes: internalNotes,
            })
            .select("id")
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        pursuitId = (created as { id: string }).id;

        // Log pipeline activity so the client's timeline shows this entry
        await db.from("pipeline_activity").insert({
            pursuit_id: pursuitId,
            user_profile_id: userProfileId,
            activity_type: "created",
            to_value: stage,
            description: `${auth.name} pushed this opportunity to your pipeline`,
        });
    }

    // Audit row
    const { data: pushRow } = await db
        .from("admin_opportunity_pushes")
        .insert({
            user_profile_id: userProfileId,
            opportunity_id: opportunityId!,
            pursuit_id: pursuitId,
            pushed_by_user_id: auth.userId,
            pushed_by_name: auth.name,
            notes: internalNotes,
            customer_message: customerMessage,
        })
        .select("id")
        .single();

    // Email the client — best-effort; don't fail the push if email is disabled
    const clientEmail = (client.email as string | null) || null;
    const clientName =
        (client.contact_name as string | null) || (client.company_name as string | null) || "there";

    let emailedAt: string | null = null;
    if (clientEmail && oppRecord) {
        try {
            await sendAgencyPipelineNotification({
                to: clientEmail,
                contactName: clientName,
                companyName: (client.company_name as string) || "your company",
                oppTitle: (oppRecord.title as string) || "New federal opportunity",
                oppAgency: (oppRecord.department as string) || (oppRecord.agency as string) || "Federal Agency",
                oppResponseDeadline: (oppRecord.response_deadline as string) || null,
                oppNoticeId: (oppRecord.notice_id as string) || null,
                pushedByName: auth.name,
                customerMessage,
                nextSteps,
            });
            emailedAt = new Date().toISOString();
            if (pushRow) {
                await db
                    .from("admin_opportunity_pushes")
                    .update({ email_sent_at: emailedAt })
                    .eq("id", (pushRow as { id: string }).id);
            }
        } catch {
            // Swallow — the push succeeded, email is a bonus
        }
    }

    // Fire webhook for anyone listening
    fireWebhookEvent(userProfileId, "pursuit.added", {
        pursuit_id: pursuitId,
        opportunity_id: opportunityId,
        notice_id: (oppRecord?.notice_id as string) || null,
        stage,
        priority,
        via: "admin_push",
        pushed_by: auth.name,
        customer_message: customerMessage,
    }).catch(() => { /* logged in webhook_deliveries */ });

    return NextResponse.json({
        pursuit_id: pursuitId,
        opportunity_id: opportunityId,
        created: !existing,
        emailed: !!emailedAt,
    });
}
