import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { extractBearer, resolveToken } from "@/lib/api-token";
import { fireWebhookEvent } from "@/lib/webhooks";

export const maxDuration = 30;

/**
 * /api/pursuits
 *
 * POST — create a pursuit. Primary caller is Zapier (bearer-token) or any
 *        third-party integration; the in-app pipeline page talks directly
 *        to Supabase for speed.
 *
 * GET  — list the caller's pursuits (most recent first, capped at 100).
 *
 * Auth: cookie session OR Bearer <api/zapier token>. Either resolves to
 *       the same user_profile_id.
 */

async function getUserProfileId(req: NextRequest): Promise<string | null> {
    // 1. Cookie session
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data } = await admin
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();
        if (data) return (data as { id: string }).id;
    }

    // 2. Bearer token (zapier / api / mcp all work here)
    const token = extractBearer(req.headers.get("authorization"));
    const resolved = await resolveToken(token);
    return resolved?.userProfileId || null;
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function GET(req: NextRequest) {
    const userProfileId = await getUserProfileId(req);
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

    const { data, error } = await admin()
        .from("user_pursuits")
        .select("id, opportunity_id, stage, priority, notes, created_at, stage_changed_at, opportunities(notice_id, title, department, response_deadline, award_amount)")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pursuits: data || [] });
}

export async function POST(req: NextRequest) {
    const userProfileId = await getUserProfileId(req);
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const noticeId = (body.notice_id as string | undefined)?.trim();
    const opportunityIdInput = (body.opportunity_id as string | undefined)?.trim();
    const stage = (body.stage as string | undefined) || "discovered";
    const priority = (body.priority as string | undefined) || "medium";
    const notes = (body.notes as string | undefined) || null;

    if (!noticeId && !opportunityIdInput) {
        return NextResponse.json({ error: "notice_id or opportunity_id required" }, { status: 400 });
    }

    const db = admin();

    // Resolve opportunity_id from notice_id if needed
    let opportunityId = opportunityIdInput || null;
    let opportunityTitle: string | null = null;
    if (!opportunityId && noticeId) {
        const { data: opp } = await db
            .from("opportunities")
            .select("id, title")
            .eq("notice_id", noticeId)
            .single();
        if (!opp) {
            return NextResponse.json({ error: `No opportunity with notice_id=${noticeId}` }, { status: 404 });
        }
        opportunityId = (opp as { id: string }).id;
        opportunityTitle = (opp as { title: string | null }).title;
    }

    // Already a pursuit?
    const { data: existing } = await db
        .from("user_pursuits")
        .select("id, stage")
        .eq("user_profile_id", userProfileId)
        .eq("opportunity_id", opportunityId)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({
            pursuit: existing,
            created: false,
            message: "Pursuit already exists for this opportunity",
        });
    }

    const { data: created, error } = await db
        .from("user_pursuits")
        .insert({
            user_profile_id: userProfileId,
            opportunity_id: opportunityId,
            stage,
            priority,
            notes,
        })
        .select("id, opportunity_id, stage, priority, created_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fire webhook so any Zaps waiting on pursuit.added see this one
    fireWebhookEvent(userProfileId, "pursuit.added", {
        pursuit_id: (created as { id: string }).id,
        opportunity_id: opportunityId,
        notice_id: noticeId || null,
        title: opportunityTitle,
        stage,
        priority,
        via: "api",
    }).catch(() => { /* logged in webhook_deliveries */ });

    return NextResponse.json({ pursuit: created, created: true });
}
