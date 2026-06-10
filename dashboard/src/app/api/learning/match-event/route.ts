import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 10;

const VALID_EVENTS = new Set(["clicked", "dismissed", "pursued", "saved", "exported"]);

/**
 * POST /api/learning/match-event
 * Body: {
 *   user_match_id: string,
 *   event: "clicked" | "dismissed" | "pursued" | "saved" | "exported",
 *   session_id?: string
 * }
 *
 * Auth-gated. Verifies the user_match belongs to the caller before writing.
 */
export async function POST(req: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const userMatchId = typeof body.user_match_id === "string" ? body.user_match_id : "";
    const event = typeof body.event === "string" ? body.event : "";
    const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 100) : null;

    if (!userMatchId || !VALID_EVENTS.has(event)) {
        return NextResponse.json({ error: "user_match_id and valid event required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile?.id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profileId = profile.id as string;

    // Confirm the match belongs to the caller. Cheap query — uses pk index.
    const { data: match, error: mErr } = await sb
        .from("user_matches")
        .select("id, user_profile_id")
        .eq("id", userMatchId)
        .single();

    if (mErr || !match || match.user_profile_id !== profileId) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const { error: insErr } = await sb
        .from("match_engagement_events")
        .insert({
            user_match_id: userMatchId,
            user_profile_id: profileId,
            event,
            session_id: sessionId,
        });

    if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
