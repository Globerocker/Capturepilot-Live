import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/data-export — GDPR-style "give me everything" download.
 *
 * Returns a single JSON blob containing every row tied to the authenticated
 * user, across all user-owned tables. Streams as a downloadable .json with
 * a filename keyed to the company name + today's date so admins can hand it
 * to a user without confusion.
 *
 * Pairs with /api/account/delete-request — users typically download first,
 * then request deletion.
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = svc();
    const { data: profile } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
    const profileId = (profile as { id: string }).id;

    // Pull every user-owned dataset in parallel. Each query is bounded by
    // user_profile_id so a malicious caller can't fan-out to other users.
    const [
        matches, pursuits, actions, tasks, docs, competitors, partners,
        activity, savedSearches, messages, pipelineActivity,
    ] = await Promise.all([
        admin.from("user_matches").select("*").eq("user_profile_id", profileId).limit(10_000),
        admin.from("user_pursuits").select("*").eq("user_profile_id", profileId),
        admin.from("user_action_items").select("*").eq("user_profile_id", profileId),
        admin.from("client_tasks").select("*").eq("user_profile_id", profileId),
        admin.from("client_documents").select("*").eq("user_profile_id", profileId),
        admin.from("client_competitors").select("*").eq("user_profile_id", profileId),
        admin.from("client_partners").select("*").eq("user_profile_id", profileId),
        admin.from("client_activity_log").select("*").eq("user_profile_id", profileId),
        admin.from("saved_searches").select("*").eq("user_profile_id", profileId).then(r => r, () => ({ data: [] })),
        admin.from("client_messages").select("*").eq("user_profile_id", profileId).then(r => r, () => ({ data: [] })),
        admin.from("pipeline_activity").select("*").eq("user_profile_id", profileId).then(r => r, () => ({ data: [] })),
    ]);

    const payload = {
        export_meta: {
            generated_at: new Date().toISOString(),
            requested_by: user.email,
            spec: "https://gdpr-info.eu/art-20-gdpr/",
            schema_version: 1,
        },
        auth: {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
        },
        profile,
        user_matches: matches.data || [],
        user_pursuits: pursuits.data || [],
        user_action_items: actions.data || [],
        client_tasks: tasks.data || [],
        client_documents: docs.data || [],
        client_competitors: competitors.data || [],
        client_partners: partners.data || [],
        client_activity_log: activity.data || [],
        saved_searches: savedSearches.data || [],
        client_messages: messages.data || [],
        pipeline_activity: pipelineActivity.data || [],
    };

    const company = String((profile as { company_name?: string }).company_name || "user").replace(/[^a-z0-9-]+/gi, "_");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `capturepilot_export_${company}_${date}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}
