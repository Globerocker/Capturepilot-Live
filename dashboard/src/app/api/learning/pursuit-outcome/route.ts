import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 10;

const VALID_OUTCOMES = new Set(["won", "lost", "no_bid", "withdrawn"]);

/**
 * POST /api/learning/pursuit-outcome
 * Body: {
 *   pursuit_id: string,
 *   outcome: "won" | "lost" | "no_bid" | "withdrawn",
 *   amount_awarded?: number,
 *   decision_date?: string (YYYY-MM-DD),
 *   lessons_learned?: string
 * }
 *
 * Auth-gated. Verifies the pursuit belongs to the caller before writing.
 */
export async function POST(req: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const pursuitId = typeof body.pursuit_id === "string" ? body.pursuit_id : "";
    const outcome = typeof body.outcome === "string" ? body.outcome : "";
    if (!pursuitId || !VALID_OUTCOMES.has(outcome)) {
        return NextResponse.json({ error: "pursuit_id and valid outcome required" }, { status: 400 });
    }

    const amountAwarded = typeof body.amount_awarded === "number" ? body.amount_awarded : null;
    const decisionDate = typeof body.decision_date === "string" && body.decision_date.length > 0
        ? body.decision_date
        : null;
    const lessonsLearned = typeof body.lessons_learned === "string" && body.lessons_learned.trim().length > 0
        ? body.lessons_learned.slice(0, 4000)
        : null;

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

    // Resolve caller's profile and confirm pursuit ownership in one round-trip.
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile?.id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profileId = profile.id as string;

    const { data: pursuit, error: pErr } = await sb
        .from("user_pursuits")
        .select("id, user_profile_id")
        .eq("id", pursuitId)
        .single();

    if (pErr || !pursuit || pursuit.user_profile_id !== profileId) {
        return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    }

    const { data: inserted, error: insErr } = await sb
        .from("pursuit_outcomes")
        .insert({
            user_pursuit_id: pursuitId,
            user_profile_id: profileId,
            outcome,
            amount_awarded: amountAwarded,
            decision_date: decisionDate,
            lessons_learned: lessonsLearned,
        })
        .select("id, captured_at")
        .single();

    if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: inserted?.id, captured_at: inserted?.captured_at });
}
